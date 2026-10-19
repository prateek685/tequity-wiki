import {
  FINAL_OUTCOMES,
  type FinalReviewResult,
  type FinalStatus,
  gateCriteria,
  type Lesson,
  LIVE_PATHS,
  type LiveCallRow,
  type LivePath,
  type LiveRole,
  OBSERVERS,
  RAG,
  type ReadinessCase,
} from "@portal/contracts";
import { z } from "zod";
import { groupBy } from "./learner.js";
import { storedDay } from "../content/lesson.js";
import { authorNames, personOf } from "../manager/authors.js";
import { type Tx } from "../prisma/prisma.service.js";

/**
 * Phase 3 (packages/contracts/src/final-review.ts): live-call days, the readiness case and the final
 * review. The loaders read only what the engineer and their managers may both read (live_calls,
 * readiness_cases, final_reviews), so the same answer comes back whoever asks.
 */

const livePath = z.enum(LIVE_PATHS);
const outcome = z.enum(FINAL_OUTCOMES);
const observer = z.enum(OBSERVERS);
const rag = z.enum(RAG);
const caseFields = z.array(z.object({ id: z.string(), label: z.string(), value: z.string() }));

/** The live-call days in the imported content: day → the role of its live lesson. */
export async function loadLiveDays(tx: Tx): Promise<Map<number, LiveRole>> {
  const rows = await tx.contentDay.findMany({
    where: { type: "live_call" },
    orderBy: { day: "asc" },
    select: { day: true, data: true },
  });
  const days = new Map<number, LiveRole>();
  for (const row of rows) {
    const live = storedDay.parse(row.data).lessons.find((item) => item.kind === "live");
    if (live?.liveRole) days.set(row.day, live.liveRole);
  }
  return days;
}

/**
 * Every live-call day of several enrollments (enrollment id → rows in day order; a day not saved yet has
 * path null). Phase 3 days are never repeated, but the latest round wins if they were.
 */
export async function loadLiveCalls(
  tx: Tx,
  enrollmentIds: readonly string[],
  liveDays?: ReadonlyMap<number, LiveRole>,
): Promise<Map<string, LiveCallRow[]>> {
  const days = liveDays ?? (await loadLiveDays(tx));
  const rows =
    enrollmentIds.length === 0
      ? []
      : await tx.liveCall.findMany({
          where: { enrollmentId: { in: [...enrollmentIds] } },
          orderBy: { round: "asc" },
          select: { enrollmentId: true, day: true, path: true, deferred: true, updatedAt: true },
        });
  const byEnrollment = groupBy(rows, (row) => row.enrollmentId);
  return new Map(
    enrollmentIds.map((id) => {
      const saved = new Map((byEnrollment.get(id) ?? []).map((row) => [row.day, row]));
      return [
        id,
        [...days].map(([day, role]) => {
          const row = saved.get(day);
          return {
            day,
            role,
            path: row ? livePath.parse(row.path) : null,
            deferred: row?.deferred ?? false,
            updatedAt: row?.updatedAt.toISOString() ?? null,
          };
        }),
      ];
    }),
  );
}

/** Live-call days still "later" (they must be done before the final review). */
export function pendingLiveDays(rows: readonly LiveCallRow[]): number[] {
  return rows.filter((row) => row.path === "later").map((row) => row.day);
}

/** Save the path of a live lesson. "Later" is remembered even after the call is done. */
export async function saveLiveCall(
  tx: Tx,
  at: { enrollmentId: string; userId: string; day: number; round: number },
  role: LiveRole,
  path: LivePath,
): Promise<void> {
  const { userId, ...key } = at;
  const previous = await tx.liveCall.findUnique({
    where: { enrollmentId_day_round: key },
    select: { deferred: true },
  });
  const deferred = (previous?.deferred ?? false) || path === "later";
  await tx.liveCall.upsert({
    where: { enrollmentId_day_round: key },
    create: { ...key, userId, role, path, deferred },
    update: { role, path, deferred, updatedAt: new Date() },
  });
}

/**
 * Share the readiness case: the lesson's fields with their labels, in order. Once the final review is
 * recorded the shared case stays as it was reviewed (the engineer's own entry still saves).
 */
export async function shareReadinessCase(
  tx: Tx,
  at: { enrollmentId: string; userId: string },
  lesson: Pick<Lesson, "fields">,
  values: Readonly<Record<string, string>>,
): Promise<void> {
  const reviewed = await tx.finalReview.findUnique({
    where: { enrollmentId: at.enrollmentId },
    select: { id: true },
  });
  if (reviewed) return;
  const fields = lesson.fields.map((field) => ({
    id: field.id,
    label: field.label,
    value: values[field.id] ?? "",
  }));
  await tx.readinessCase.upsert({
    where: { enrollmentId: at.enrollmentId },
    create: { ...at, fields },
    update: { fields, updatedAt: new Date() },
  });
}

export async function loadReadinessCase(tx: Tx, enrollmentId: string): Promise<ReadinessCase | null> {
  const row = await tx.readinessCase.findUnique({
    where: { enrollmentId },
    select: { fields: true, submittedAt: true },
  });
  return row ? { fields: caseFields.parse(row.fields), submittedAt: row.submittedAt.toISOString() } : null;
}

/** When each enrollment's readiness case was shared (enrollment id → date; missing = not shared). */
export async function loadCaseDates(tx: Tx, enrollmentIds: readonly string[]): Promise<Map<string, Date>> {
  if (enrollmentIds.length === 0) return new Map();
  const rows = await tx.readinessCase.findMany({
    where: { enrollmentId: { in: [...enrollmentIds] } },
    select: { enrollmentId: true, submittedAt: true },
  });
  return new Map(rows.map((row) => [row.enrollmentId, row.submittedAt]));
}

/** The recorded final reviews of several enrollments (enrollment id → result), with who recorded them. */
export async function loadFinalReviews(
  tx: Tx,
  enrollmentIds: readonly string[],
): Promise<Map<string, FinalReviewResult>> {
  if (enrollmentIds.length === 0) return new Map();
  const rows = await tx.finalReview.findMany({ where: { enrollmentId: { in: [...enrollmentIds] } } });
  const names = await authorNames(
    tx,
    rows.map((row) => row.managerId),
  );
  return new Map(
    rows.map((row) => [
      row.enrollmentId,
      {
        heldAt: row.heldAt.toISOString(),
        observer: observer.parse(row.observer),
        call: row.call,
        scored: row.scored,
        average: row.average,
        lowest: row.lowest,
        criteria: gateCriteria.parse(row.criteria),
        outcome: outcome.parse(row.outcome),
        rag: rag.parse(row.rag),
        note: row.note,
        by: personOf(names, row.managerId),
      },
    ]),
  );
}

/** Locked until the readiness case is shared (Day 64), then to book, then recorded. */
export function finalStatus(caseShared: boolean, result: FinalReviewResult | null | undefined): FinalStatus {
  if (result) return "recorded";
  return caseShared ? "to_book" : "locked";
}

/** Serialise the final review of one engineer (the manager's save and the engineer's case). */
export async function lockFinalReview(tx: Tx, enrollmentId: string): Promise<void> {
  const key = `final:${enrollmentId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

/** The final review in My plan and the course outline; null while Day 65 isn't imported. */
export async function finalSummary(
  tx: Tx,
  learner: { enrollment: { id: string }; readyDays: ReadonlySet<number> } | null,
): Promise<{ status: FinalStatus } | null> {
  if (!learner) return null;
  if (!learner.readyDays.has(FINAL_DAY)) return null;
  const enrollmentId = learner.enrollment.id;
  const shared = (await loadCaseDates(tx, [enrollmentId])).has(enrollmentId);
  const result = (await loadFinalReviews(tx, [enrollmentId])).get(enrollmentId);
  return { status: finalStatus(shared, result) };
}

/** The final review's day (the last day of the plan). */
export const FINAL_DAY = 65;

/** The live-call plan the manager recorded at Gate 2 (latest round with a plan), null if none. */
export async function loadLivePlan(tx: Tx, enrollmentId: string): Promise<string | null> {
  const row = await tx.gateResult.findFirst({
    where: { enrollmentId, gate: 2, liveCallPlan: { not: null } },
    orderBy: { round: "desc" },
    select: { liveCallPlan: true },
  });
  return row?.liveCallPlan ?? null;
}
