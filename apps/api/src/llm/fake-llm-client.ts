import { type PointVerdict, type ScoreResult } from "@portal/contracts";
import { type LlmClient, type ScoredAnswer, type ScoreInput } from "./llm-client.js";

/** Words too common to count as a scoring point's keywords. */
const STOP_WORDS = new Set(
  "a an and are as at be but by each for from has have in is it its of on or that the their them they this to was what when which who will with you your".split(
    " ",
  ),
);

/** Patient-data patterns: a record number, a date of birth, or a US-style date. */
const PHI_PATTERN = /\b(MRN|DOB)\b|date of birth|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/i;

/** Filler a coach would cut from a sentence. */
const FILLER = /\b(basically|actually|just|kindly|really|very)\s+/gi;

export const FAKE_MODEL = "fake/keyword-scorer";

/**
 * Deterministic stand-in for the model (development without ANTHROPIC_API_KEY, and all tests). A
 * point is met when at least half of its keywords appear in the answer, partly when some do. The score
 * follows the verdicts (all met → 5, none → 1), so it always passes the consistency check.
 */
export class FakeLlmClient implements LlmClient {
  readonly name = "fake";

  score(input: ScoreInput): Promise<ScoredAnswer> {
    return Promise.resolve({ result: fakeScore(input), model: FAKE_MODEL });
  }
}

export function fakeScore(input: ScoreInput): ScoreResult {
  const answerWords = new Set(wordsOf(input.answer));
  const points = input.scoringPoints.map((point) => {
    const keywords = [...new Set(wordsOf(point).filter((word) => !STOP_WORDS.has(word)))];
    const found = keywords.filter((word) => answerWords.has(word)).length;
    const verdict: PointVerdict =
      keywords.length > 0 && found * 2 >= keywords.length ? "met" : found > 0 ? "partly" : "not_met";
    return { point, verdict };
  });
  const met = points.filter((p) => p.verdict === "met").length;
  const partly = points.filter((p) => p.verdict === "partly").length;
  const score =
    met === points.length
      ? 5
      : met === 0 && partly === 0
        ? 1
        : Math.min(4, Math.max(2, 1 + Math.round(((met + partly / 2) / points.length) * 4)));
  const missing = points.find((p) => p.verdict !== "met");
  return {
    points,
    score,
    reason: missing
      ? `${met} of ${points.length} points met. Next time, work on: ${missing.point}.`
      : `All ${points.length} points met. Clear and client-ready.`,
    betterSentence: betterSentence(input.answer),
    possiblePhi: PHI_PATTERN.test(input.answer),
  };
}

function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3);
}

/** The answer's first sentence, tidied: filler cut, capitalised, ending with a full stop. */
function betterSentence(answer: string): string {
  const first =
    answer
      .split(/\n+|(?<=[.!?])\s+/)
      .map((line) => line.replace(/^[^:\n]{1,40}:\s*$/, "").trim())
      .find((line) => line.length > 0) ?? "";
  const tidy = first.replace(FILLER, "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (!tidy) return "Lead with the answer, then one reason.";
  const sentence = tidy.charAt(0).toUpperCase() + tidy.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}
