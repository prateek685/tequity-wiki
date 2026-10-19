import { Injectable } from "@nestjs/common";
import {
  GATE_AFTER_DAY,
  GATES,
  type Checkin,
  CHECKIN_DAYS,
  type CheckinFormResponse,
  checkinFormResponse,
  type EngineerDetailResponse,
  engineerDetailResponse,
  type FinalStatus,
  type PillarScores,
  RAG,
  RED_FLAG_KINDS,
  type RedFlagKind,
  type ReadinessModel,
  type SaveCheckinRequest,
  type TeamEngineer,
  type TeamResponse,
  teamResponse,
  type TeamTask,
  type UnlockOption,
  type UnlockRecord,
  type UnlockRequest,
  UNLOCK_KINDS,
} from "@portal/contracts";
import { z } from "zod";
import { authorNames, personOf } from "./authors.js";
import { type ManagedEngineer, managedMembers, requireManagedEngineer } from "./engineer.js";
import { audit } from "../common/audit.js";
import { asContract } from "../common/contract.js";
import { dateFromIso, isoFromDate, todayIso } from "../common/dates.js";
import { DomainError } from "../common/domain-error.js";
import { loadReadinessModel } from "../content/lesson.js";
import { type GateProgress, loadAllGateResults, loadGateProgresses } from "../learning/gates.js";
import { groupBy, type Learner, loadLearners, loadPaces } from "../learning/learner.js";
import {
  FINAL_DAY,
  finalStatus,
  loadCaseDates,
  loadFinalReviews,
  loadLiveCalls,
} from "../learning/phase3.js";
import { buildProgress } from "../learning/progress.js";
import {
  baselinePillars,
  loadAllBaselineRatings,
  loadAllScorecards,
  loadBaselineRatings,
  loadScorecards,
} from "../learning/scorecards.js";
import { PrismaService, type Tx } from "../prisma/prisma.service.js";
import { gateDue, isGatePassed } from "../rules/gates.js";
import {
  buildTracker,
  checkinDueDetail,
  type CheckinDue,
  checkinsDue,
  checkinWeek,
  effectiveRetakeAt,
  type LatestAssessment,
  nextCheckpoint,
  unlockOption,
} from "../rules/manager.js";
import { inCurrentRound } from "../rules/rounds.js";
import { roundOne, scorecardSeries } from "../rules/scorecard.js";

/**
 * Manager v1 (docs/PORTAL_PLAN.md §9 "Manager", packages/contracts/src/manager.ts). Every query runs
 * as the manager through `withUser`, so row-level security decides which engineers, answers and
 * records they see: an engineer outside their teams is simply not found. Private content (lesson
 * entries, daily quizzes, write answers, non-assessment AI feedback) is never read here; numbers from
 * private tables come through the SECURITY DEFINER functions used by `buildProgress`.
 */

const rag = z.enum(RAG);
const unlockKind = z.enum(UNLOCK_KINDS);

const CHECKIN_SELECT = {
  id: true,
  afterDay: true,
  heldOn: true,
  rag: true,
  note: true,
  managerId: true,
  updatedAt: true,
} as const;

interface CheckinRow {
  id: string;
  afterDay: number;
  heldOn: Date;
  rag: string;
  note: string;
  managerId: string;
  updatedAt: Date;
}

type Engineer = ManagedEngineer;

/** What the Team row and the detail page share about one engineer. */
interface EngineerState {
  /** Gate 1 and Gate 2. */
  gates: GateProgress[];
  scorecards: Awaited<ReturnType<typeof scorecardSeries>>["scorecards"];
  pillars: PillarScores;
  checkins: CheckinRow[];
  due: CheckinDue[];
  unlock: UnlockOption | null;
  next: string | null;
}

const redFlagKind = z.enum(RED_FLAG_KINDS);

@Injectable()
export class ManagerService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Team ──────────────────────────────────────────────────────────────────────────────────────

  team(managerId: string): Promise<TeamResponse> {
    return this.prisma.withUser(managerId, async (tx) => {
      const members = await managedMembers(tx, managerId);
      const model = await loadReadinessModel(tx);
      const now = new Date();
      // Open (not yet acknowledged) red flags of the manager's engineers (row-level security).
      const openFlags = await tx.redFlag.findMany({
        where: { acknowledgedAt: null },
        orderBy: { raisedAt: "asc" },
        select: { userId: true, kind: true },
      });
      let redFlags = 0;

      const engineers: TeamEngineer[] = [];
      const checkinTasks: { task: TeamTask; overdue: number; gate?: true }[] = [];
      // One query per kind of data for the whole team (not per engineer).
      const learners = await loadLearners(
        tx,
        members.map((member) => member.user.id),
      );
      const states = await this.engineerStates(tx, [...learners.values()], model, now);
      const paces = await loadPaces(tx, [...learners.values()]);
      const finals = await loadFinalReviews(
        tx,
        [...learners.values()].map((learner) => learner.enrollment.id),
      );
      for (const member of members) {
        const learner = learners.get(member.user.id);
        const state = learner && states.get(learner.enrollment.id);
        const pace = learner && paces.get(learner.enrollment.id);
        if (!learner || !state || !pace) continue;
        const person = { id: member.user.id, name: member.user.name };
        const flags = openFlags.filter((flag) => flag.userId === person.id);
        redFlags += flags.length;
        engineers.push({
          ...person,
          teamName: member.team.name,
          startDate: learner.enrollment.startDate,
          targetDate: learner.enrollment.targetDate,
          daysDone: learner.completedDays.size,
          currentDay: learner.states.find((s) => s.status === "open")?.day ?? null,
          pace: { status: pace.status, difference: pace.difference },
          pillars: state.pillars,
          rag: state.checkins.length ? rag.parse(state.checkins.at(-1)?.rag) : null,
          next: state.next,
          unlock: state.unlock,
          flags: openFlagKinds(flags.map((flag) => flag.kind)),
          finalOutcome: finals.get(learner.enrollment.id)?.outcome ?? null,
        });

        for (const gate of state.gates) {
          const gateTask = this.gateTask(person, gate, learner);
          if (gateTask) checkinTasks.push(gateTask);
        }
        for (const due of state.due) {
          checkinTasks.push({
            task: {
              engineer: person,
              title: `Check-in · ${person.name}`,
              detail: checkinDueDetail(due),
              status: due.status,
              href: `/manager/engineers/${person.id}/checkins/${due.day}`,
            },
            overdue: due.status === "overdue" ? due.days : -1,
          });
        }
      }

      // Overdue check-ins first (most overdue first), then check-ins due.
      const overdue = checkinTasks
        .filter((t) => t.task.status === "overdue")
        .sort((a, b) => b.overdue - a.overdue)
        .map((t) => t.task);
      const due = checkinTasks.filter((t) => t.task.status === "due").map((t) => t.task);
      const tasks = [...overdue, ...due];
      const gateTasks = checkinTasks.filter((t) => t.gate).length;
      const started = engineers.filter((e) => e.pace && e.pace.status !== "not_started");
      return asContract(teamResponse, {
        engineers,
        kpis: {
          engineers: engineers.length,
          onTrack: engineers.filter((e) => e.pace?.status === "on_pace" || e.pace?.status === "ahead").length,
          checkinsDue: checkinTasks.length - gateTasks,
          redFlags,
          averagePace: started.length
            ? roundOne(started.reduce((sum, e) => sum + (e.pace?.difference ?? 0), 0) / started.length)
            : null,
        },
        tasks,
      });
    });
  }

  // ── Engineer detail and unlock ────────────────────────────────────────────────────────────────

  engineer(managerId: string, engineerId: string): Promise<EngineerDetailResponse> {
    return this.prisma.withUser(managerId, async (tx) => {
      const engineer = await this.requireEngineer(tx, managerId, engineerId);
      return this.detail(tx, engineer);
    });
  }

  unlock(managerId: string, engineerId: string, request: UnlockRequest): Promise<EngineerDetailResponse> {
    return this.prisma.withUser(managerId, async (tx) => {
      const before = await this.requireEngineer(tx, managerId, engineerId);
      const enrollmentId = before.learner.enrollment.id;
      // Two quick clicks must not save two unlocks.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`unlock:${enrollmentId}`}))`;
      const engineer = await this.requireEngineer(tx, managerId, engineerId);
      const model = await loadReadinessModel(tx);
      const { unlock } = await this.engineerState(tx, engineer.learner, model, new Date());
      if (!unlock || unlock.kind !== request.kind || unlock.day !== request.day) {
        throw new DomainError("NOTHING_TO_UNLOCK");
      }
      await tx.manualUnlock.create({
        data: {
          enrollmentId,
          userId: engineerId,
          managerId,
          kind: unlock.kind,
          day: unlock.day,
          reason: request.reason,
        },
      });
      await audit(tx, "unlock.granted", "enrollment", enrollmentId, null, {
        engineer: engineerId,
        kind: unlock.kind,
        day: unlock.day,
        reason: request.reason,
      });
      // Reload: the day (or retake) is open now.
      return this.detail(tx, await this.requireEngineer(tx, managerId, engineerId));
    });
  }

  // ── Check-ins ─────────────────────────────────────────────────────────────────────────────────

  checkinForm(managerId: string, engineerId: string, day: number): Promise<CheckinFormResponse> {
    return this.prisma.withUser(managerId, async (tx) => {
      const engineer = await this.requireEngineer(tx, managerId, engineerId);
      return this.form(tx, engineer, day);
    });
  }

  saveCheckin(
    managerId: string,
    engineerId: string,
    day: number,
    request: SaveCheckinRequest,
  ): Promise<CheckinFormResponse> {
    return this.prisma.withUser(managerId, async (tx) => {
      const engineer = await this.requireEngineer(tx, managerId, engineerId);
      if (!engineer.learner.completedDays.has(day)) throw new DomainError("CHECKIN_NOT_REACHED");
      const enrollmentId = engineer.learner.enrollment.id;
      const key = { enrollmentId_afterDay: { enrollmentId, afterDay: day } };
      const previous = await tx.checkin.findUnique({
        where: key,
        select: { rag: true, heldOn: true },
      });
      const fields = {
        managerId,
        heldOn: dateFromIso(request.heldOn),
        rag: request.rag,
        note: request.note,
      };
      const saved = await tx.checkin.upsert({
        where: key,
        create: { enrollmentId, userId: engineerId, afterDay: day, ...fields },
        update: { ...fields, updatedAt: new Date() },
        select: { id: true },
      });
      await audit(
        tx,
        "checkin.saved",
        "checkin",
        saved.id,
        previous ? { rag: previous.rag, heldOn: isoFromDate(previous.heldOn) } : null,
        { engineer: engineerId, afterDay: day, rag: request.rag, heldOn: request.heldOn },
      );
      return this.form(tx, engineer, day);
    });
  }

  // ── helpers ───────────────────────────────────────────────────────────────────────────────────

  /**
   * The Team page's gate row: a gate to book (Day 20/40 finished, or the repeat weeks done again) is due for
   * 7 days, then overdue; a received recap waits for the result. Shown with the check-ins (the task kind
   * enum has review | checkin only).
   */
  private gateTask(
    person: { id: string; name: string },
    gate: GateProgress,
    learner: Learner,
  ): { task: TeamTask; overdue: number; gate: true } | null {
    const { status, round } = gate.state;
    const recap = gate.recaps.get(round);
    const since =
      status === "recap_sent"
        ? recap?.submittedAt
        : status === "rerun"
          ? (gate.repeatDoneAt ?? gate.reachedAt)
          : status === "to_book"
            ? gate.reachedAt
            : null;
    if (!since) return null;
    const due = gateDue(todayIso(since, learner.timezone), learner.today);
    const detail =
      status === "recap_sent"
        ? "Recap received · record the result"
        : status === "rerun"
          ? "Repeat weeks done · book 45 min"
          : `Finished Day ${GATE_AFTER_DAY[gate.gate]} · book 45 min`;
    return {
      task: {
        engineer: person,
        title: `Gate ${gate.gate} · ${person.name}`,
        detail,
        status: due.status,
        href: `/manager/engineers/${person.id}/gates/${gate.gate}`,
      },
      overdue: due.status === "overdue" ? due.days : -1,
      gate: true,
    };
  }

  private requireEngineer(tx: Tx, managerId: string, engineerId: string): Promise<Engineer> {
    return requireManagedEngineer(tx, managerId, engineerId);
  }

  /** One engineer's state (the detail page and unlock). */
  private async engineerState(
    tx: Tx,
    learner: Learner,
    model: ReadinessModel | null,
    now: Date,
  ): Promise<EngineerState> {
    return (await this.engineerStates(tx, [learner], model, now)).get(learner.enrollment.id) as EngineerState;
  }

  /**
   * The state of several engineers (enrollment id → state): one query per kind of data for all of them,
   * then the pure rules per engineer. The Team page's query count doesn't grow with the team.
   */
  private async engineerStates(
    tx: Tx,
    learners: readonly Learner[],
    model: ReadinessModel | null,
    now: Date,
  ): Promise<Map<string, EngineerState>> {
    const states = new Map<string, EngineerState>();
    if (learners.length === 0) return states;
    const enrollmentIds = learners.map((learner) => learner.enrollment.id);
    const baselines = await loadAllBaselineRatings(tx, enrollmentIds);
    const allScorecards = await loadAllScorecards(tx, enrollmentIds);
    const checkinRows = await tx.checkin.findMany({
      where: { enrollmentId: { in: enrollmentIds } },
      orderBy: { afterDay: "asc" },
      select: { enrollmentId: true, ...CHECKIN_SELECT },
    });
    const attemptRows = await tx.quizAttempt.findMany({
      where: { enrollmentId: { in: enrollmentIds }, kind: "assessment" },
      orderBy: [{ startedAt: "desc" }, { attempt: "desc" }],
      select: { enrollmentId: true, day: true, round: true, completedAt: true, passed: true, retakeAt: true },
    });
    const allGates = await loadGateProgresses(tx, learners);
    const caseDates = await loadCaseDates(tx, enrollmentIds);
    const finals = await loadFinalReviews(tx, enrollmentIds);
    const checkinsOf = groupBy(checkinRows, (row) => row.enrollmentId);
    const attemptsOf = groupBy(attemptRows, (row) => row.enrollmentId);
    for (const learner of learners) {
      const enrollmentId = learner.enrollment.id;
      const dayOne = baselinePillars(baselines.get(enrollmentId) ?? null, model);
      const { scorecards, now: pillars } = scorecardSeries(allScorecards.get(enrollmentId) ?? [], dayOne);
      const checkins: CheckinRow[] = (checkinsOf.get(enrollmentId) ?? []).map(
        ({ enrollmentId: _, ...row }) => row,
      );
      const attempts = attemptsOf.get(enrollmentId) ?? [];
      const gates = allGates.get(enrollmentId) ?? [];
      states.set(
        enrollmentId,
        engineerStateOf({
          learner,
          scorecards,
          pillars,
          checkins,
          attempts,
          gates,
          finalReview: learner.readyDays.has(FINAL_DAY)
            ? finalStatus(caseDates.has(enrollmentId), finals.get(enrollmentId))
            : undefined,
          now,
        }),
      );
    }
    return states;
  }
  private async detail(tx: Tx, engineer: Engineer): Promise<EngineerDetailResponse> {
    const { learner } = engineer;
    const progress = await buildProgress(tx, learner);
    const model = await loadReadinessModel(tx);
    const state = await this.engineerState(tx, learner, model, new Date());
    const unlocks = await tx.manualUnlock.findMany({
      where: { enrollmentId: learner.enrollment.id },
      orderBy: { createdAt: "desc" },
      select: { kind: true, day: true, reason: true, managerId: true, createdAt: true },
    });
    const names = await authorNames(tx, [
      ...state.checkins.map((row) => row.managerId),
      ...unlocks.map((row) => row.managerId),
    ]);
    const records: UnlockRecord[] = unlocks.map((row) => ({
      kind: unlockKind.parse(row.kind),
      day: row.day,
      reason: row.reason,
      by: personOf(names, row.managerId),
      at: row.createdAt.toISOString(),
    }));
    const checkins = state.checkins.map((row) => toCheckin(row, names));
    const gateResults = (await loadAllGateResults(tx, [learner.enrollment.id])).get(learner.enrollment.id);
    const latestGates = [];
    for (const gate of GATES) {
      const latest = gateResults?.get(gate)?.at(-1)?.result;
      if (latest) latestGates.push({ gate, rag: latest.rag, note: latest.note });
    }
    return asContract(engineerDetailResponse, {
      engineer: {
        id: engineer.id,
        name: engineer.name,
        teamName: engineer.teamName,
        startDate: learner.enrollment.startDate,
        targetDate: learner.enrollment.targetDate,
      },
      progress,
      tracker: buildTracker({
        doneDays: learner.doneDays,
        scorecards: progress.scorecards,
        checkins,
        gates: latestGates,
      }),
      checkins,
      checkinsDue: state.due.map((due) => due.day),
      unlocks: records,
      unlock: state.unlock,
      liveCalls: (await loadLiveCalls(tx, [learner.enrollment.id])).get(learner.enrollment.id) ?? [],
    });
  }

  private async form(tx: Tx, engineer: Engineer, day: number): Promise<CheckinFormResponse> {
    const { learner } = engineer;
    const enrollmentId = learner.enrollment.id;
    const model = await loadReadinessModel(tx);
    const dayOne = baselinePillars(await loadBaselineRatings(tx, enrollmentId), model);
    const { scorecards } = scorecardSeries(await loadScorecards(tx, enrollmentId), dayOne);
    const week = checkinWeek(day);
    const row = await tx.checkin.findUnique({
      where: { enrollmentId_afterDay: { enrollmentId, afterDay: day } },
      select: CHECKIN_SELECT,
    });
    const names = await authorNames(tx, row ? [row.managerId] : []);
    const prep = await tx.checkinPrep.findUnique({
      where: { enrollmentId_afterDay: { enrollmentId, afterDay: day } },
      select: { spotCheck: true, stuck: true, support: true, updatedAt: true },
    });
    return asContract(checkinFormResponse, {
      engineer: { id: engineer.id, name: engineer.name },
      afterDay: day,
      week,
      reached: learner.completedDays.has(day),
      scorecards: scorecards.filter((card) => card.week <= week).slice(-2),
      prep: prep ? { ...prep, updatedAt: prep.updatedAt.toISOString() } : null,
      checkin: row ? toCheckin(row, names) : null,
    });
  }
}

/** The distinct open flag kinds, in the contract's order. */
function openFlagKinds(kinds: readonly string[]): RedFlagKind[] {
  const open = new Set(kinds.flatMap((kind) => redFlagKind.safeParse(kind).data ?? []));
  return RED_FLAG_KINDS.filter((kind) => open.has(kind));
}

function toCheckin(row: CheckinRow, names: ReadonlyMap<string, string>): Checkin {
  return {
    afterDay: row.afterDay,
    week: checkinWeek(row.afterDay),
    heldOn: isoFromDate(row.heldOn),
    rag: rag.parse(row.rag),
    note: row.note,
    by: personOf(names, row.managerId),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** One engineer's state from their loaded rows (no database access). */
function engineerStateOf(input: {
  learner: Learner;
  scorecards: EngineerState["scorecards"];
  pillars: PillarScores;
  checkins: CheckinRow[];
  /** Assessment attempts, newest first. */
  attempts: readonly {
    day: number;
    round: number;
    completedAt: Date | null;
    passed: boolean | null;
    retakeAt: Date | null;
  }[];
  gates: GateProgress[];
  /** The final review's status (null: not reached, Day 65 not imported or a test without one). */
  finalReview?: FinalStatus;
  now: Date;
}): EngineerState {
  const { learner, scorecards, pillars, checkins, attempts, gates, now } = input;
  // Failed and waiting for the retake: the latest attempt of the day's current round failed.
  const assessmentsFailed = new Set<number>();
  const seen = new Set<number>();
  for (const attempt of inCurrentRound(attempts, learner.rounds)) {
    if (seen.has(attempt.day)) continue;
    seen.add(attempt.day);
    if (attempt.completedAt && attempt.passed === false) assessmentsFailed.add(attempt.day);
  }
  const latestRow = attempts[0];
  const latestAssessment: LatestAssessment | null = latestRow
    ? {
        day: latestRow.day,
        completed: latestRow.completedAt !== null,
        passed: latestRow.passed,
        retakeAt: effectiveRetakeAt(
          latestRow.retakeAt,
          latestRow.completedAt,
          learner.retakeUnlocks.get(latestRow.day) ?? null,
        ),
      }
    : null;
  // The first completion of each check-in day (a repeat doesn't move a check-in): progress is oldest first.
  const checkinDays = new Set<number>(CHECKIN_DAYS);
  const completedOn = new Map<number, string>();
  for (const row of learner.progress) {
    if (row.completedAt && checkinDays.has(row.day) && !completedOn.has(row.day)) {
      completedOn.set(row.day, todayIso(row.completedAt, learner.timezone));
    }
  }
  const recorded = new Set(checkins.map((row) => row.afterDay));
  return {
    gates,
    scorecards,
    pillars,
    checkins,
    due: checkinsDue({ completedOn, recorded, today: learner.today }),
    unlock: unlockOption({
      latestAssessment,
      states: learner.states,
      readyDays: learner.readyDays,
      now,
    }),
    next: nextCheckpoint({
      doneDays: learner.doneDays,
      assessmentsPassed: learner.assessmentsPassed,
      checkins: recorded,
      gatesPassed: new Set(gates.filter((g) => isGatePassed(g.state.status)).map((g) => g.gate)),
      assessmentsFailed,
      gates: gates.map((g) => ({ gate: g.gate, status: g.state.status })),
      finalReview: input.finalReview,
    }),
  };
}
