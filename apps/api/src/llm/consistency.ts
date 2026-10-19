import { type ScoreResult, scoreResult } from "@portal/contracts";

/** A scorer result that is invalid or doesn't agree with itself or the guide: a failed attempt (retried). */
export class InvalidScoreError extends Error {
  constructor(problem: string) {
    super(`Invalid score: ${problem}`);
    this.name = "InvalidScoreError";
  }
}

/**
 * The server's check of a score (docs/PORTAL_PLAN.md §7 "Consistency"): valid shape, one verdict per
 * scoring point in the guide's order, all points met → score ≥ 4, none met → score ≤ 2. Returns the
 * result with the guide's own point texts (the model may paraphrase them). Throws `InvalidScoreError`.
 */
export function checkScore(raw: unknown, scoringPoints: readonly string[]): ScoreResult {
  const parsed = scoreResult.safeParse(raw);
  if (!parsed.success) throw new InvalidScoreError("does not match the schema");
  const result = parsed.data;
  if (result.points.length !== scoringPoints.length) {
    throw new InvalidScoreError(`${result.points.length} verdicts for ${scoringPoints.length} points`);
  }
  // Free models may paraphrase a point, so each verdict must be closest to the guide's point in the
  // same position (a swapped order fails); the stored text is always the guide's.
  result.points.forEach((point, index) => {
    const words = wordsOf(point.point);
    const own = overlap(words, wordsOf(scoringPoints[index] ?? ""));
    if (scoringPoints.some((other, j) => j !== index && overlap(words, wordsOf(other)) > own)) {
      throw new InvalidScoreError(`point ${index + 1} is not the guide's point ${index + 1}`);
    }
  });
  const verdicts = result.points.map((point) => point.verdict);
  if (verdicts.every((verdict) => verdict === "met") && result.score < 4) {
    throw new InvalidScoreError("all points met but the score is below 4");
  }
  if (verdicts.every((verdict) => verdict === "not_met") && result.score > 2) {
    throw new InvalidScoreError("no point met but the score is above 2");
  }
  return {
    ...result,
    points: result.points.map((point, index) => ({
      point: scoringPoints[index] ?? point.point,
      verdict: point.verdict,
    })),
    reason: result.reason.trim(),
    betterSentence: result.betterSentence.trim(),
  };
}

/** The words of a point, ignoring case, punctuation and a leading "1." numbering. */
function wordsOf(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/^\s*\d+[.)]\s*/, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return new Set(words);
}

/** Share of words in common (0–1). */
function overlap(a: Set<string>, b: Set<string>): number {
  const union = new Set([...a, ...b]).size;
  if (union === 0) return 1;
  return [...a].filter((word) => b.has(word)).length / union;
}
