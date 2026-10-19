import { type QuestionType } from "@portal/contracts";

/** Daily quiz: 5 questions from the day's pool, in this order (docs/M1_SPEC.md "Daily quiz"). */
export const DAILY_QUIZ_MIX: readonly QuestionType[] = ["mcq", "mcq", "mcq", "scenario", "written"];

interface Candidate {
  id: string;
  type: QuestionType;
}

function needed(type: QuestionType): number {
  return DAILY_QUIZ_MIX.filter((t) => t === type).length;
}

/** True when the pool has enough questions of each type for the daily mix. */
export function canSupplyDailyQuiz(pool: readonly Candidate[]): boolean {
  return (["mcq", "scenario", "written"] as const).every(
    (type) => pool.filter((q) => q.type === type).length >= needed(type),
  );
}

/** Fisher–Yates with an injectable random source (0 ≤ r < 1), so tests are deterministic. */
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = a;
  }
  return copy;
}

/**
 * Pick the daily quiz: 3 mcq, 1 scenario, 1 written, in that order, at random within each type.
 * Returns null when the pool can't supply that mix.
 */
export function pickDailyQuiz<T extends Candidate>(
  pool: readonly T[],
  random: () => number = Math.random,
): T[] | null {
  if (!canSupplyDailyQuiz(pool)) return null;
  const byType = new Map<QuestionType, T[]>();
  for (const type of ["mcq", "scenario", "written"] as const) {
    byType.set(
      type,
      shuffled(
        pool.filter((q) => q.type === type),
        random,
      ),
    );
  }
  return DAILY_QUIZ_MIX.map((type) => {
    const next = byType.get(type)?.shift();
    if (!next) throw new Error("pickDailyQuiz: pool check and pick disagree");
    return next;
  });
}
