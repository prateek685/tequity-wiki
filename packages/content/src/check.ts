import { type Question } from "@portal/contracts";
import { type ContentBundle, type DayFile } from "./files.js";

/**
 * Cross-file checks for `pnpm content:check` (docs/LESSON_FORMAT.md). Pure: takes the parsed bundle and
 * the PDF's extracted text (docs/pdf-text.txt) and returns a list of problems; empty means OK. Not every
 * day needs to exist yet: days are written block by block.
 */

/** Daily pools: 10 questions, shown 5 (3 multiple choice, 1 scenario, 1 written). */
export const DAILY_POOL = { size: 10, mcq: 3, scenario: 1, written: 1 } as const;
/** Assessment pools: about 20 questions, shown 10; the 60% pass mark counts multiple choice and scenario only. */
export const ASSESSMENT_POOL = { minSize: 16, minChoice: 12, minWritten: 2 } as const;

/** Lower-case, straight quotes, plain hyphens, PDF ligatures expanded, whitespace collapsed. */
export function normalizeText(text: string): string {
  return text
    .replace(/ﬀ/g, "ff")
    .replace(/ﬁ/g, "fi")
    .replace(/ﬂ/g, "fl")
    .replace(/ﬃ/g, "ffi")
    .replace(/ﬄ/g, "ffl")
    .replace(/[‘’′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Words only: used where the PDF's table extraction scrambles punctuation and line order. */
function wordsOnly(text: string): string {
  return normalizeText(text)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function poolNumber(pool: string): number {
  return Number(pool.slice(pool.indexOf("-") + 1));
}

function idPrefix(pool: string): string {
  return `${pool.startsWith("day") ? "D" : "A"}${pool.slice(pool.indexOf("-") + 1)}-`;
}

function checkQuestion(q: Question, where: string, problems: string[]): void {
  const hasOptions = q.options !== undefined && q.options.length > 0;
  if (q.type === "written") {
    if (hasOptions) problems.push(`${where}: written question must not have options`);
    if (!q.modelAnswer) problems.push(`${where}: written question needs a modelAnswer`);
    const points = q.scoringPoints?.length ?? 0;
    if (points < 2 || points > 3) problems.push(`${where}: written question needs 2–3 scoringPoints`);
    return;
  }
  if (q.options?.length !== 4) {
    problems.push(`${where}: needs exactly 4 options`);
  } else if (q.options.filter((option) => option.correct).length !== 1) {
    problems.push(`${where}: needs exactly 1 correct option`);
  }
  if (q.type === "scenario" && !q.clientLine) problems.push(`${where}: scenario question needs a clientLine`);
  if (q.modelAnswer || q.scoringPoints) problems.push(`${where}: only written questions have a model answer`);
}

function checkDay(day: DayFile, bundle: ContentBundle, problems: string[]): void {
  const where = `days/day-${String(day.day).padStart(2, "0")}`;
  if (!bundle.blocks.some((b) => b.number === day.block))
    problems.push(`${where}: block ${day.block} has no file`);
  const expectedBlock = Math.ceil(day.day / 5);
  if (day.block !== expectedBlock) problems.push(`${where}: should be in block ${expectedBlock}`);

  const ids = day.lessons.map((lesson) => lesson.id);
  for (const id of new Set(ids)) {
    if (ids.filter((x) => x === id).length > 1) problems.push(`${where}: lesson id "${id}" is used twice`);
  }

  for (const lesson of day.lessons) {
    const at = `${where} ${lesson.id}`;
    if (lesson.kind === "mock") {
      if (!lesson.cardId) problems.push(`${at}: a mock lesson needs a cardId`);
      else if (!bundle.cards.some((c) => c.id === lesson.cardId))
        problems.push(`${at}: card ${lesson.cardId} has no file`);
    } else if (lesson.cardId || lesson.level || lesson.scriptNote || lesson.callStep || !lesson.brief) {
      problems.push(`${at}: only mock lessons have a card, level and scriptNote`);
    }
    if (lesson.kind === "live") {
      if (!lesson.liveRole) problems.push(`${at}: a live lesson needs a liveRole`);
      if (!lesson.substituteCardId) problems.push(`${at}: a live lesson needs a substituteCardId`);
      else if (!bundle.cards.some((c) => c.id === lesson.substituteCardId))
        problems.push(`${at}: card ${lesson.substituteCardId} has no file`);
      if (day.type !== "live_call") problems.push(`${at}: a live lesson needs a live_call day`);
    } else if (lesson.liveRole || lesson.substituteCardId || lesson.fallback) {
      problems.push(`${at}: only live lessons have a liveRole, substitute card and fallback`);
    }
    if (lesson.prefillFrom) {
      const { day: from, lesson: fromId } = lesson.prefillFrom;
      const source = bundle.days.find((d) => d.day === from)?.lessons.find((l) => l.id === fromId);
      if (from >= day.day) problems.push(`${at}: prefillFrom must point to an earlier day`);
      else if (!source) problems.push(`${at}: prefillFrom day ${from} "${fromId}" doesn't exist`);
      else if (source.fields.map((f) => f.id).join() !== lesson.fields.map((f) => f.id).join())
        problems.push(`${at}: prefillFrom needs the same fields as day ${from} "${fromId}"`);
    }
    if (lesson.shareReadiness && bundle.days.some((d) => d !== day && d.lessons.some((l) => l.shareReadiness)))
      problems.push(`${at}: only one lesson can share the readiness case`);
    if (lesson.baseline && lesson.kind !== "rate") problems.push(`${at}: only a rate lesson has the baseline`);
    if (lesson.scorecard.length > 0 && lesson.kind !== "scorecard")
      problems.push(`${at}: only a scorecard lesson rates behaviours`);
    if (lesson.kind === "scorecard" && lesson.scorecard.length === 0)
      problems.push(`${at}: a scorecard lesson needs behaviours to rate`);
    const known = new Set(bundle.plan?.behaviours.map((b) => b.id) ?? []);
    for (const id of lesson.scorecard) if (!known.has(id)) problems.push(`${at}: unknown behaviour ${id}`);
    const fieldIds = lesson.fields.map((field) => field.id);
    for (const id of new Set(fieldIds)) {
      if (fieldIds.filter((x) => x === id).length > 1) problems.push(`${at}: field id "${id}" is used twice`);
    }
    if (lesson.checks.length > 0 && !lesson.checksTitle) problems.push(`${at}: checks need a checksTitle`);
    for (const block of lesson.blocks) {
      if (block.type === "field" && !fieldIds.includes(block.id))
        problems.push(`${at}: field block "${block.id}" isn't in fields`);
      if (block.type !== "recall") continue;
      const source = bundle.days.find((d) => d.day === block.day)?.lessons.find((l) => l.id === block.lesson);
      const earlierToday =
        block.day === day.day &&
        day.lessons.findIndex((l) => l.id === block.lesson) < day.lessons.indexOf(lesson) &&
        day.lessons.some((l) => l.id === block.lesson);
      if (block.day > day.day || (block.day === day.day && !earlierToday))
        problems.push(`${at}: recall must point to an earlier lesson`);
      else if (!source) problems.push(`${at}: recall lesson day ${block.day} "${block.lesson}" doesn't exist`);
      else
        for (const field of block.fields) {
          if (!source.fields.some((f) => f.id === field.id))
            problems.push(`${at}: recall field "${field.id}" isn't in day ${block.day} "${block.lesson}"`);
        }
    }
  }

  if (day.type === "live_call" && !day.lessons.some((l) => l.kind === "live"))
    problems.push(`${where}: a live_call day needs a live lesson`);

  for (const id of Object.keys(day.scoring ?? {})) {
    const target = day.lessons.find((lesson) => lesson.id === id);
    if (!target || target.kind !== "write") problems.push(`${where}: scoring "${id}" needs a write lesson`);
  }
}

export function checkContent(bundle: ContentBundle, pdfText: string): string[] {
  const problems: string[] = [];
  const pdf = normalizeText(pdfText);
  const pdfWords = wordsOnly(pdfText);

  if (!bundle.plan) problems.push("content/plan.yaml: missing");

  // Days: unique, in a block that exists, lessons well formed.
  const seenDays = new Set<number>();
  for (const day of bundle.days) {
    if (seenDays.has(day.day)) problems.push(`days/day-${String(day.day).padStart(2, "0")}: duplicate day`);
    seenDays.add(day.day);
    checkDay(day, bundle, problems);
  }

  // Library pages: no blocks that need an engineer's own saved answers.
  for (const entry of bundle.library) {
    for (const block of entry.blocks) {
      if (block.type === "recall" || block.type === "field" || block.type === "pillarCompare")
        problems.push(`library/${entry.id}: a library page can't use a ${block.type} block`);
    }
  }

  // Blocks: unique.
  const blockNumbers = bundle.blocks.map((b) => b.number);
  for (const n of new Set(blockNumbers)) {
    if (blockNumbers.filter((x) => x === n).length > 1) problems.push(`blocks/block-${n}: duplicate block`);
  }

  // Cards: unique.
  const cardIds = bundle.cards.map((c) => c.id);
  for (const id of new Set(cardIds)) {
    if (cardIds.filter((x) => x === id).length > 1) problems.push(`cards/${id}: duplicate card`);
  }

  // Questions: pool shape, ids, answers, sources, duplicates.
  const seenIds = new Set<string>();
  const seenStems = new Map<string, string>();
  for (const pool of bundle.pools) {
    const n = poolNumber(pool.pool);
    const isDaily = pool.pool.startsWith("day");
    if (isDaily && !seenDays.has(n)) problems.push(`questions/${pool.pool}: Day ${n} has no lesson file`);
    if (!isDaily && n % 5 !== 0) problems.push(`questions/${pool.pool}: assessments follow every 5th day`);

    const count = (type: Question["type"]) => pool.questions.filter((q) => q.type === type).length;
    if (isDaily) {
      if (pool.questions.length !== DAILY_POOL.size) {
        problems.push(
          `questions/${pool.pool}: has ${pool.questions.length} questions, needs ${DAILY_POOL.size}`,
        );
      }
      if (
        count("mcq") < DAILY_POOL.mcq ||
        count("scenario") < DAILY_POOL.scenario ||
        count("written") < DAILY_POOL.written
      ) {
        problems.push(`questions/${pool.pool}: needs at least 3 mcq, 1 scenario and 1 written`);
      }
    } else {
      if (pool.questions.length < ASSESSMENT_POOL.minSize) {
        problems.push(
          `questions/${pool.pool}: has ${pool.questions.length} questions, needs ${ASSESSMENT_POOL.minSize}+`,
        );
      }
      if (
        count("mcq") + count("scenario") < ASSESSMENT_POOL.minChoice ||
        count("written") < ASSESSMENT_POOL.minWritten
      ) {
        problems.push(`questions/${pool.pool}: needs 12+ multiple choice/scenario and 2+ written`);
      }
    }

    for (const q of pool.questions) {
      const where = `questions/${pool.pool} ${q.id}`;
      if (!q.id.startsWith(idPrefix(pool.pool)))
        problems.push(`${where}: id must start with ${idPrefix(pool.pool)}`);
      if (seenIds.has(q.id)) problems.push(`${where}: duplicate id`);
      seenIds.add(q.id);

      checkQuestion(q, where, problems);

      const quote = normalizeText(q.source.quote);
      const quoteWords = wordsOnly(q.source.quote);
      if (!pdf.includes(quote) && !pdfWords.includes(quoteWords))
        problems.push(`${where}: source quote not found in the PDF`);

      const stem = normalizeText(q.stem + (q.clientLine ?? ""));
      const duplicateOf = seenStems.get(stem);
      if (duplicateOf) problems.push(`${where}: same question as ${duplicateOf}`);
      seenStems.set(stem, q.id);
    }
  }

  return problems;
}
