import { Injectable } from "@nestjs/common";
import {
  FOLLOW_UP_TYPES,
  GATE_AFTER_DAY,
  GATE_OUTCOMES,
  GATES,
  type GateNo,
  type GateRecap,
  type GateResult,
  type GateSummary,
  type GateViewResponse,
  gateViewResponse,
  RAG,
  type SaveGateRecapRequest,
} from "@portal/contracts";
import { z } from "zod";
import { groupBy, type Learner, type LearnerGateResult, loadLearner, requireLearner } from "./learner.js";
import { asContract } from "../common/contract.js";
import { DomainError } from "../common/domain-error.js";
import { RequestValidationError } from "../common/zod-validation.pipe.js";
import { authorNames, personOf } from "../manager/authors.js";
import { PrismaService, type Tx } from "../prisma/prisma.service.js";
import {
  type GateState,
  gateState,
  isRecapOpen,
  type RepeatProgress,
  repeatProgress,
} from "../rules/gates.js";

/**
 * Phase gates (docs/PORTAL_PLAN.md §2–§3, packages/contracts/src/gates.ts). The loaders here are shared by
 * the engineer's Gate page, My plan / the course outline, and the manager's gate screens: they read only
 * what both may read (gate results, recaps, gate rubric scores, day progress), so the same answer comes
 * back whoever asks. Gate 1 (after Day 20) and Gate 2 (after Day 40, with the written follow-up, healthcare
 * terms and the Phase 3 live-call plan) share it.
 */

const outcome = z.enum(GATE_OUTCOMES);
const rag = z.enum(RAG);
const followUpType = z.enum(FOLLOW_UP_TYPES);

/** The rubric_scores rows of a gate are stored against the gate's day (20 / 40). */
export const GATE_SOURCE = "gate";

export interface StoredRecap {
  text: string;
  submittedAt: Date;
  /** Gate 2's written follow-up (null for Gate 1). */
  followUpType: string | null;
  followUpText: string | null;
}

/** Where a learner is with one gate. */
export interface GateProgress {
  gate: GateNo;
  state: GateState;
  /** When the gate's day (Day 20) was first completed, null before. */
  reachedAt: Date | null;
  /** The latest recorded result (highest round). */
  latest: LearnerGateResult | null;
  /** Gate round → recap. */
  recaps: ReadonlyMap<number, StoredRecap>;
  /** While the latest result is a repeat: the reopened days, done or not in the new round. */
  repeat: RepeatProgress | null;
  /** When the reopened days were all done (the rerun was reached), else null. */
  repeatDoneAt: Date | null;
}

export async function loadGateProgress(tx: Tx, learner: Learner, gate: GateNo): Promise<GateProgress> {
  const recapRows = await tx.gateRecap.findMany({
    where: { enrollmentId: learner.enrollment.id, gate },
    select: { round: true, text: true, submittedAt: true, followUpType: true, followUpText: true },
  });
  return gateProgressOf(learner, gate, recapRows);
}

/** Gate 1 and Gate 2 of several learners (enrollment id → progress per gate): one query for all the recaps. */
export async function loadGateProgresses(
  tx: Tx,
  learners: readonly Learner[],
): Promise<Map<string, GateProgress[]>> {
  const progresses = new Map<string, GateProgress[]>();
  if (learners.length === 0) return progresses;
  const recapRows = await tx.gateRecap.findMany({
    where: {
      enrollmentId: { in: learners.map((learner) => learner.enrollment.id) },
      gate: { in: [...GATES] },
    },
    select: {
      enrollmentId: true,
      gate: true,
      round: true,
      text: true,
      submittedAt: true,
      followUpType: true,
      followUpText: true,
    },
  });
  const recapsOf = groupBy(recapRows, (row) => `${row.enrollmentId}:${row.gate}`);
  for (const learner of learners) {
    progresses.set(
      learner.enrollment.id,
      GATES.map((gate) =>
        gateProgressOf(
          learner,
          gate,
          (recapsOf.get(`${learner.enrollment.id}:${gate}`) ?? []).map(
            ({ round, text, submittedAt, followUpType, followUpText }) => ({
              round,
              text,
              submittedAt,
              followUpType,
              followUpText,
            }),
          ),
        ),
      ),
    );
  }
  return progresses;
}

/** Where the learner is with the gate, from its recaps (no database access). */
function gateProgressOf(
  learner: Learner,
  gate: GateNo,
  recapRows: readonly ({ round: number } & StoredRecap)[],
): GateProgress {
  const afterDay = GATE_AFTER_DAY[gate];
  const reachedAt = learner.progress.find((row) => row.day === afterDay)?.completedAt ?? null;
  const latest = learner.gateResults.filter((row) => row.gate === gate).at(-1) ?? null;
  const recaps = new Map(recapRows.map(({ round, ...recap }) => [round, recap]));
  const repeat =
    latest?.outcome === "repeat"
      ? repeatProgress(latest.repeatWeeks, learner.doneDays, learner.assessmentsPassed)
      : null;
  const state = gateState({
    reached: reachedAt !== null,
    latest,
    recapRounds: new Set(recaps.keys()),
    repeatComplete: repeat?.complete ?? false,
  });
  let repeatDoneAt: Date | null = null;
  if (repeat?.complete && latest) {
    const days = new Set(repeat.days.map((d) => d.day));
    const times = learner.progress
      .filter((row) => days.has(row.day) && row.round === latest.round + 1 && row.completedAt)
      .map((row) => row.completedAt?.getTime() ?? 0);
    repeatDoneAt = times.length ? new Date(Math.max(...times)) : null;
  }
  return { gate, state, reachedAt, latest, recaps, repeat, repeatDoneAt };
}

/** A recorded result as the screens show it, with the scenario the manager picked. */
export interface FullGateResult {
  result: GateResult;
  cardId: string | null;
  surprise: string;
}

/** Every recorded result of the gate, lowest round first, with its criteria and who recorded it. */
export async function loadGateResults(tx: Tx, enrollmentId: string, gate: GateNo): Promise<FullGateResult[]> {
  return (await loadAllGateResults(tx, [enrollmentId], [gate])).get(enrollmentId)?.get(gate) ?? [];
}

/**
 * The recorded results of several enrollments' gates (enrollment id → gate → results, lowest round first;
 * gates without results are missing): one query for the results, one for their criteria, one for the names.
 */
export async function loadAllGateResults(
  tx: Tx,
  enrollmentIds: readonly string[],
  gates: readonly GateNo[] = GATES,
): Promise<Map<string, Map<GateNo, FullGateResult[]>>> {
  const all = new Map<string, Map<GateNo, FullGateResult[]>>();
  if (enrollmentIds.length === 0) return all;
  const rows = await tx.gateResult.findMany({
    where: { enrollmentId: { in: [...enrollmentIds] }, gate: { in: [...gates] } },
    orderBy: { round: "asc" },
  });
  if (rows.length === 0) return all;
  const scores = await tx.rubricScore.findMany({
    where: {
      enrollmentId: { in: [...new Set(rows.map((row) => row.enrollmentId))] },
      source: GATE_SOURCE,
      day: { in: gates.map((gate) => GATE_AFTER_DAY[gate]) },
    },
    select: { enrollmentId: true, day: true, round: true, criterion: true, score: true },
  });
  const names = await authorNames(
    tx,
    rows.map((row) => row.managerId),
  );
  const scoresOf = groupBy(scores, (score) => `${score.enrollmentId}:${score.day}:${score.round}`);
  for (const row of rows) {
    const gate: GateNo = row.gate === 2 ? 2 : 1;
    const byGate = all.get(row.enrollmentId) ?? new Map<GateNo, FullGateResult[]>();
    all.set(row.enrollmentId, byGate);
    const list = byGate.get(gate) ?? [];
    byGate.set(gate, list);
    list.push({
      cardId: row.cardId,
      surprise: row.surprise,
      result: {
        round: row.round,
        heldAt: row.heldAt.toISOString(),
        scored: row.scored,
        average: row.average,
        lowest: row.lowest,
        criteria: Object.fromEntries(
          (scoresOf.get(`${row.enrollmentId}:${GATE_AFTER_DAY[gate]}:${row.round}`) ?? [])
            .sort((a, b) => a.criterion - b.criterion)
            .map((score) => [String(score.criterion), score.score]),
        ),
        recapOnTime: row.recapOnTime,
        outcome: outcome.parse(row.outcome),
        focusItems: row.focusItems,
        repeatWeeks: row.repeatWeeks,
        rag: rag.parse(row.rag),
        note: row.note,
        by: personOf(names, row.managerId),
        healthcareTerms: row.healthcareTerms,
        liveCallPlan: row.liveCallPlan,
      },
    });
  }
  return all;
}

export function toRecap(recap: StoredRecap | undefined): GateRecap | null {
  if (!recap) return null;
  const type = followUpType.safeParse(recap.followUpType);
  return {
    text: recap.text,
    submittedAt: recap.submittedAt.toISOString(),
    followUpType: type.success ? type.data : null,
    followUpText: type.success ? recap.followUpText : null,
  };
}

/** The gates in My plan and the course outline. */
export async function gateSummaries(tx: Tx, learner: Learner | null): Promise<GateSummary[]> {
  const summaries: GateSummary[] = [];
  for (const gate of GATES) {
    const status = learner ? (await loadGateProgress(tx, learner, gate)).state.status : "locked";
    summaries.push({ gate, afterDay: GATE_AFTER_DAY[gate], status });
  }
  return summaries;
}

/**
 * The recap's fields as stored: Gate 2 needs the written follow-up too (its type and text); Gate 1 never
 * stores one.
 */
export function recapFields(
  gate: GateNo,
  request: SaveGateRecapRequest,
): { text: string; followUpType: string | null; followUpText: string | null } {
  if (gate === 1) return { text: request.text, followUpType: null, followUpText: null };
  const fields: Record<string, string> = {};
  if (!request.followUpType) fields.followUpType = "Choose the follow-up type.";
  if (!request.followUpText) fields.followUpText = "Write the follow-up.";
  const first = Object.values(fields)[0];
  if (first) throw new RequestValidationError(fields, first);
  return {
    text: request.text,
    followUpType: request.followUpType ?? null,
    followUpText: request.followUpText ?? null,
  };
}

/** Serialise saves of one engineer's gate (the recap and the manager's result). */
export async function lockGate(tx: Tx, enrollmentId: string, gate: GateNo): Promise<void> {
  const key = `gate:${enrollmentId}:${gate}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

/** The engineer's Gate page (GET /api/me/gates/:gate) and recap (PUT …/recap). */
@Injectable()
export class GateService {
  constructor(private readonly prisma: PrismaService) {}

  view(userId: string, gate: GateNo): Promise<GateViewResponse> {
    return this.prisma.withUser(userId, async (tx) =>
      this.buildView(tx, await requireLearner(tx, userId), gate),
    );
  }

  saveRecap(userId: string, gate: GateNo, request: SaveGateRecapRequest): Promise<GateViewResponse> {
    const fields = recapFields(gate, request);
    return this.prisma.withUser(userId, async (tx) => {
      const first = await requireLearner(tx, userId);
      await lockGate(tx, first.enrollment.id, gate);
      const learner = (await loadLearner(tx, userId)) ?? first;
      const { state } = await loadGateProgress(tx, learner, gate);
      if (state.status === "locked") throw new DomainError("GATE_NOT_REACHED");
      if (!isRecapOpen(state.status)) throw new DomainError("GATE_RECORDED");
      const key = { enrollmentId: learner.enrollment.id, gate, round: state.round };
      await tx.gateRecap.upsert({
        where: { enrollmentId_gate_round: key },
        create: { ...key, userId, ...fields },
        update: { ...fields, updatedAt: new Date() },
      });
      return this.buildView(tx, learner, gate);
    });
  }

  private async buildView(tx: Tx, learner: Learner, gate: GateNo): Promise<GateViewResponse> {
    const progress = await loadGateProgress(tx, learner, gate);
    const { state } = progress;
    const results = (await loadGateResults(tx, learner.enrollment.id, gate)).map((r) => r.result);
    return asContract(gateViewResponse, {
      gate,
      status: state.status,
      round: state.round,
      afterDay: GATE_AFTER_DAY[gate],
      reachedAt: progress.reachedAt?.toISOString() ?? null,
      recap: toRecap(progress.recaps.get(state.round)),
      result: results.find((r) => r.round === state.round) ?? null,
      history: results.filter((r) => r.round < state.round).reverse(),
      repeatDays: state.status === "repeat" ? (progress.repeat?.days ?? []) : [],
      unlockAll: learner.unlockAll,
    });
  }
}
