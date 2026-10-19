import { Injectable } from "@nestjs/common";
import { GATES, gatePillarAverages, type Pillar, PILLARS, type ReadinessModel } from "@portal/contracts";
import { PinoLogger } from "nestjs-pino";
import { todayIso } from "../common/dates.js";
import { loadReadinessModel } from "../content/lesson.js";
import { EmailQueue } from "../email/email-queue.js";
import { loadGateResults } from "../learning/gates.js";
import { type Learner, loadLearner } from "../learning/learner.js";
import { loadLiveCalls } from "../learning/phase3.js";
import { baselinePillars, loadBaselineRatings, loadScorecards } from "../learning/scorecards.js";
import { PrismaService, type Tx } from "../prisma/prisma.service.js";
import {
  addDays,
  type RedFlagEvaluation,
  type RedFlagGateResult,
  type RedFlagInput,
  redFlagSignals,
} from "../rules/red-flags.js";
import { scorecardSeries } from "../rules/scorecard.js";

const DEFAULT_PILLAR_NAMES: Record<Pillar, string> = {
  understand: "Understand",
  communicate: "Communicate",
  own: "Own",
  stand_firm: "Stand firm",
};

/** Practice is looked up this many days back (two 7-day periods ending yesterday, plus a margin). */
const PRACTICE_LOOKBACK_DAYS = 16;

/**
 * One engineer's numbers for the red-flag rules, read as that engineer (`withUser`: row-level security as
 * for any of their own requests). Lesson entries and quiz answers are used for their timestamps only.
 */
export async function loadRedFlagInput(tx: Tx, learner: Learner): Promise<RedFlagInput> {
  const enrollmentId = learner.enrollment.id;
  const tz = learner.timezone;
  const dateOf = (at: Date) => todayIso(at, tz);
  const model = await loadReadinessModel(tx);

  const day5 = learner.progress
    .filter((row) => row.day === 5 && row.completedAt)
    .map((row) => row.completedAt?.getTime() ?? 0);
  const newest = await tx.scorecard.findFirst({
    where: { enrollmentId },
    orderBy: { submittedAt: "desc" },
    select: { week: true, submittedAt: true },
  });
  const dayOne = baselinePillars(await loadBaselineRatings(tx, enrollmentId), model);
  const { scorecards } = scorecardSeries(await loadScorecards(tx, enrollmentId), dayOne);

  const gates: RedFlagGateResult[] = [];
  const criterionPillar = criterionPillars(model);
  for (const gate of GATES) {
    for (const { result } of await loadGateResults(tx, enrollmentId, gate)) {
      gates.push({
        gate,
        round: result.round,
        outcome: result.outcome,
        pillarAverages: gatePillarAverages(result.criteria, criterionPillar),
      });
    }
  }

  const since = new Date(`${addDays(learner.today, -PRACTICE_LOOKBACK_DAYS)}T00:00:00.000Z`);
  const entries = await tx.stepEntry.findMany({
    where: { enrollmentId, updatedAt: { gte: since } },
    select: { doneAt: true, updatedAt: true },
  });
  const answers = await tx.quizItem.findMany({
    where: { attempt: { enrollmentId }, answeredAt: { gte: since } },
    select: { answeredAt: true },
  });
  const practiceDays = new Set([
    ...entries.flatMap((row) => [dateOf(row.doneAt), dateOf(row.updatedAt)]),
    ...answers.flatMap((row) => (row.answeredAt ? [dateOf(row.answeredAt)] : [])),
  ]);

  const pauses = await tx.pause.findMany({
    where: { enrollmentId },
    select: { fromDate: true, toDate: true },
  });

  return {
    today: learner.today,
    startDate: learner.enrollment.startDate,
    pauses: pauses.map((p) => ({
      from: p.fromDate.toISOString().slice(0, 10),
      to: p.toDate.toISOString().slice(0, 10),
    })),
    day5DoneOn: day5.length ? dateOf(new Date(Math.min(...day5))) : null,
    lastScorecard: newest ? { on: dateOf(newest.submittedAt), week: newest.week } : null,
    scorecards: scorecards.map((card) => ({ week: card.week, scores: card.scores })),
    gates,
    practiceDays,
    liveAvoided: ((await loadLiveCalls(tx, [enrollmentId])).get(enrollmentId) ?? []).flatMap(
      (row): RedFlagInput["liveAvoided"] =>
        row.path === "substitute"
          ? [{ day: row.day, how: "substitute" }]
          : row.deferred
            ? [{ day: row.day, how: "deferred" }]
            : [],
    ),
    pillarNames: pillarNames(model),
  };
}

function criterionPillars(model: ReadinessModel | null): Record<number, Pillar> {
  return Object.fromEntries((model?.rubric ?? []).map((criterion) => [criterion.number, criterion.pillar]));
}

function pillarNames(model: ReadinessModel | null): Record<Pillar, string> {
  const names = { ...DEFAULT_PILLAR_NAMES };
  for (const pillar of model?.pillars ?? []) if (PILLARS.includes(pillar.id)) names[pillar.id] = pillar.name;
  return names;
}

export interface RedFlagRunResult {
  engineers: number;
  raised: number;
  emailJobs: number;
}

/**
 * The hourly red-flag run (worker; docs/PORTAL_PLAN.md §3, §8 "Schedules"). For each engineer with an
 * active enrollment and Day 65 not done: read their numbers as them, apply the pure rules, then sync the
 * flags (new ones save their email items) through the system-only SECURITY DEFINER functions. Last, one
 * email job per manager with pending items. Idempotent: running it twice raises nothing new and sends nothing twice.
 */
@Injectable()
export class RedFlagRunner {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailQueue,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RedFlagRunner.name);
  }

  async runAll(now = new Date()): Promise<RedFlagRunResult> {
    const candidates = await this.prisma.system.$queryRaw<{ user_id: string; enrollment_id: string }[]>`
      SELECT user_id, enrollment_id FROM app.red_flag_candidates()`;
    let raised = 0;
    for (const row of candidates) {
      try {
        const result = await this.runFor(row.user_id);
        raised += result.raised;
      } catch (error) {
        // One engineer's bad data must not stop the others.
        this.logger.error(
          { userId: row.user_id, error: error instanceof Error ? error.message.slice(0, 200) : "unknown" },
          "red flags not checked for an engineer",
        );
      }
    }
    const emailJobs = await this.queueEmails(now);
    this.logger.info({ engineers: candidates.length, raised, emailJobs }, "red flags checked");
    return { engineers: candidates.length, raised, emailJobs };
  }

  /** One engineer: sync their flags. */
  async runFor(userId: string): Promise<{ raised: number; evaluation: RedFlagEvaluation | null }> {
    const loaded = await this.prisma.withUser(userId, async (tx) => {
      const learner = await loadLearner(tx, userId);
      if (!learner || learner.completedDays.has(65)) return null;
      return { learner, input: await loadRedFlagInput(tx, learner) };
    });
    if (!loaded) return { raised: 0, evaluation: null };
    const { learner, input } = loaded;
    const evaluation = redFlagSignals(input);
    const enrollmentId = learner.enrollment.id;
    const synced = await this.prisma.system.$queryRaw<{ raised: number }[]>`
      SELECT app.red_flags_sync(${enrollmentId}::uuid, ${JSON.stringify(evaluation.signals)}::jsonb,
        ${JSON.stringify(evaluation.hold)}::jsonb) AS raised`;
    const raised = synced[0]?.raised ?? 0;
    return { raised, evaluation };
  }

  /** One email job per manager with pending items (also re-queues items left from an earlier run). */
  async queueEmails(now = new Date()): Promise<number> {
    const recipients = await this.prisma.system.$queryRaw<{ recipient_id: string }[]>`
      SELECT recipient_id FROM app.email_pending_recipients()`;
    await this.emails.enqueue(
      recipients.map((row) => row.recipient_id),
      now,
    );
    return recipients.length;
  }
}
