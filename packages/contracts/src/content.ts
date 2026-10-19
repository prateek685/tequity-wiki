import { z } from "zod";

/**
 * Curriculum content shapes (docs/LESSON_FORMAT.md). The same shapes are used by the YAML files in
 * `content/` (validated by @portal/content), stored by the import, and returned by the API.
 * Lessons are written for the portal; text fields hold short Markdown.
 */

/** Markdown text. */
export const md = z.string().trim().min(1);
/** A page number of the 198-page PDF, so questions can be checked against it. */
export const pdfPage = z.number().int().min(1).max(198);

export const PILLARS = ["understand", "communicate", "own", "stand_firm"] as const;
export type Pillar = (typeof PILLARS)[number];

/**
 * A day is a short course of lessons shown one at a time in the course player (docs/LESSON_FORMAT.md),
 * followed by the daily quiz. Lessons follow the CareBook story; engineers do them in order.
 */
export const LESSON_KINDS = [
  "read",
  "prep",
  "learn",
  "mock",
  "reflect",
  "write",
  "rate",
  "scorecard",
  "live",
] as const;
export type LessonKind = (typeof LESSON_KINDS)[number];
export const LESSON_KIND_LABELS: Record<LessonKind, string> = {
  read: "Read",
  prep: "Prep",
  learn: "Learn",
  mock: "Mock call",
  reflect: "Reflect",
  write: "Write",
  rate: "Rate",
  scorecard: "Scorecard",
  live: "Live call",
};

/**
 * Phase 3 live-call days (docs/PORTAL_PLAN.md §2 "Live-call days"): the engineer's role on the real call,
 * step by step — shadow (Week 9) → co-lead one part (Weeks 10–11) → lead with backup (Week 12) → solo (Week 13).
 */
export const LIVE_ROLES = ["shadow", "co_lead", "lead", "solo"] as const;
export type LiveRole = (typeof LIVE_ROLES)[number];
export const LIVE_ROLE_LABELS: Record<LiveRole, string> = {
  shadow: "Shadow",
  co_lead: "Co-lead one part",
  lead: "Lead, with backup",
  solo: "Lead solo",
};

export const DAY_TYPES = ["normal", "live_call", "real_action", "final_review"] as const;
export type DayType = (typeof DAY_TYPES)[number];

/** Where a task is done: the CareBook practice story, the engineer's real project, or either. */
export const TASK_SOURCES = ["carebook", "real_project", "both"] as const;
export type TaskSource = (typeof TASK_SOURCES)[number];

export const cardId = z.string().regex(/^[SX]\d{2}$/);
/** A lesson id, unique within its day, e.g. "meet-carebook". Also the key its entry is saved under. */
export const lessonId = z.string().regex(/^[a-z][a-z0-9-]{1,40}$/);
/** A form field id, unique within its lesson, e.g. "q1". */
export const fieldId = z.string().regex(/^[a-z][a-z0-9-]{0,30}$/);

// ── Content blocks: what a lesson shows, top to bottom ──────────────────────────────────────────

const text = z.string().trim().min(1);

/** The story moment that opens a lesson: "Tuesday, March 3 · between meetings" + 2–4 sentences. */
export const sceneBlock = z.object({ type: z.literal("scene"), when: text, text: md });
/** "Yesterday: …" one-line recap that links the days. */
export const yesterdayBlock = z.object({ type: z.literal("yesterday"), text: md });
/** Running text (short Markdown). */
export const textBlock = z.object({ type: z.literal("text"), text: md });
export const headingBlock = z.object({ type: z.literal("heading"), text });
/** A label/value table, e.g. the CareBook facts. `warn` colours a risky value. */
export const factsBlock = z.object({
  type: z.literal("facts"),
  label: text.optional(),
  rows: z.array(z.object({ label: text, value: md, warn: z.boolean().default(false) })).min(1),
});
/** The sprint timeline: done / now / next. */
export const timelineBlock = z.object({
  type: z.literal("timeline"),
  items: z
    .array(z.object({ title: text, text: text, state: z.enum(["done", "now", "next"]).default("next") }))
    .min(2),
});
/** The cast: initials avatar, name, role, what they care about. */
export const peopleBlock = z.object({
  type: z.literal("people"),
  items: z
    .array(
      z.object({
        initials: z.string().trim().min(1).max(3),
        name: text,
        role: md,
        /** Small badge, e.g. "You meet her today". */
        tag: text.optional(),
        /** The engineer's own card (accent avatar). */
        you: z.boolean().default(false),
      }),
    )
    .min(1),
});
/** A framework as numbered boxes (BLUF uses, PREP, the 3-step opener, the 6 moves of a sync). */
export const stepsBlock = z.object({
  type: z.literal("steps"),
  items: z
    .array(z.object({ title: text, text: md }))
    .min(2)
    .max(6),
});
/** Two examples side by side: the habit to break and the better version. */
export const compareBlock = z.object({
  type: z.literal("compare"),
  before: md,
  after: md,
  beforeLabel: text.default("Background first"),
  afterLabel: text.default("Answer first"),
});
/** A good example line, shown green. */
export const exampleBlock = z.object({ type: z.literal("example"), text: md });
export const noteBlock = z.object({
  type: z.literal("note"),
  tone: z.enum(["info", "warn"]).default("info"),
  title: text.optional(),
  text: md,
});
/** A video or article to open in a new tab. */
export const watchBlock = z.object({ type: z.literal("watch"), url: z.url(), title: text, meta: text });
/** A message to work on (e.g. a messy Slack message), shown as a grey box. */
export const messageBlock = z.object({ type: z.literal("message"), label: text, text: md });
/** Copyable text that isn't secret (e.g. an AI review prompt). Card prompts use the mock lesson instead. */
export const copyBlock = z.object({ type: z.literal("copy"), label: text, text: md });
/** The 4 pillars as cards (from the readiness model). */
export const pillarsBlock = z.object({ type: z.literal("pillars") });
/** The 14 behaviours grouped by pillar, each opening to "Sounds like" / "Watch out for". */
export const behavioursBlock = z.object({ type: z.literal("behaviours") });
/** The engineer's own saved answers from an earlier lesson (e.g. Day 4 shows the Day 1 call notes). */
export const recallBlock = z.object({
  type: z.literal("recall"),
  label: text,
  day: z.number().int().min(1).max(65),
  lesson: lessonId,
  /** Which saved fields to show, with their labels. */
  fields: z.array(z.object({ id: fieldId, label: text })).min(1),
});

/** Day 1 → now, per pillar: the Day-1 baseline next to the latest scorecard scores (readiness case, Day 65). */
export const pillarCompareBlock = z.object({ type: z.literal("pillarCompare"), label: text.optional() });

/** Shows one of the lesson's `fields` here, inline (e.g. a rewrite box under each message). */
export const fieldBlock = z.object({ type: z.literal("field"), id: fieldId });

export const contentBlock = z.discriminatedUnion("type", [
  sceneBlock,
  yesterdayBlock,
  textBlock,
  headingBlock,
  factsBlock,
  timelineBlock,
  peopleBlock,
  stepsBlock,
  compareBlock,
  exampleBlock,
  noteBlock,
  watchBlock,
  messageBlock,
  copyBlock,
  pillarsBlock,
  behavioursBlock,
  recallBlock,
  fieldBlock,
  pillarCompareBlock,
]);
export type ContentBlock = z.infer<typeof contentBlock>;

// ── What the engineer fills in ──────────────────────────────────────────────────────────────────

/** A text input. `line` = one line, `area` = a box. Optional unless `required`. */
export const formField = z.object({
  id: fieldId,
  label: text,
  kind: z.enum(["line", "area"]).default("area"),
  placeholder: z.string().default(""),
  rows: z.number().int().min(2).max(12).optional(),
  required: z.boolean().default(false),
});
export type FormField = z.infer<typeof formField>;

/**
 * One lesson. Order of rendering: `blocks`, then (mock) the card, then the inputs: `fields`, `checks`,
 * `rounds`, the baseline or scorecard ratings. A lesson is done when it's saved ("Next" saves it).
 */
export const lesson = z.object({
  id: lessonId,
  kind: z.enum(LESSON_KINDS),
  /** Short: the outline, "Next: …" and the footer. */
  title: text,
  /** The page heading, when it says more than the short title. */
  heading: text.optional(),
  /** e.g. "8 min". */
  minutes: text,
  /** One line under the title. */
  lead: md.optional(),
  blocks: z.array(contentBlock).default([]),
  /** Mock: the card, its level today, and whether the example script stays folded with a note. */
  cardId: cardId.optional(),
  level: z.number().int().min(1).max(3).optional(),
  /** Mock: false shows only "Make the call" (no fact sheet, client panel or script), e.g. a repeat drill. */
  brief: z.boolean().default(true),
  /** Mock: an extra 4th step under "Make the call", e.g. "After each try, ask: …". */
  callStep: md.optional(),
  /** Mock: what the folded script's summary says, e.g. "Open it after your call to compare." */
  scriptNote: text.optional(),
  fields: z.array(formField).default([]),
  /** Items to tick, under `checksTitle` (e.g. "On this call, I…"). Ticks are never required. */
  checksTitle: text.optional(),
  checks: z.array(md).default([]),
  /** Repeat-the-call rounds (Day 4): a 1–5 score and the AI's one fix per round. */
  rounds: z.number().int().min(2).max(5).optional(),
  /** Reflect: the mock log — the engineer scores the call on criteria 1–10 (n/a allowed, at least one scored). */
  rubric: z.boolean().default(false),
  /** Rate: all 14 behaviours 1–5 (the Day-1 baseline). Required. */
  baseline: z.boolean().default(false),
  /** Scorecard: these behaviours rated 1–5, shown next to the Day-1 baseline. Required. */
  scorecard: z.array(z.string().regex(/^[UCOS]\d$/)).default([]),
  /** Which safety reminder to show when the task can use real work. */
  source: z.enum(TASK_SOURCES).default("carebook"),
  /**
   * Live lessons: the engineer's role on today's real call. The engineer picks a path (had the call /
   * shadowed another team / later / substitute mock); `fields` are the call sheet.
   */
  liveRole: z.enum(LIVE_ROLES).optional(),
  /** Live lessons: the mock to run when there's no live call (the PDF fallback card, or a CareBook substitute). */
  substituteCardId: cardId.optional(),
  /** Live lessons: the PDF's "no live call?" line, word for word when the PDF has one. */
  fallback: md.optional(),
  /** Fields start from this earlier lesson's saved answers while this one isn't saved (Day 64 ← Day 63). */
  prefillFrom: z.object({ day: z.number().int().min(1).max(65), lesson: lessonId }).optional(),
  /** Saving this lesson shares its fields with the manager as the readiness case (Day 64, A11). */
  shareReadiness: z.boolean().default(false),
});
export type Lesson = z.infer<typeof lesson>;

/** A week of 5 days ("Week 1 · Baseline and structured speaking"). Stored as a block. */
export const block = z.object({
  number: z.number().int().min(1).max(13),
  title: z.string().min(1),
  phase: z.number().int().min(1).max(3),
  goal: md,
});
export type Block = z.infer<typeof block>;

/** The public side of a mock card. The AI prompt is private: admins view it, engineers only copy it. */
export const cardPublic = z.object({
  id: cardId,
  title: z.string().min(1),
  client: z.string().min(1),
  clientRole: z.string().min(1),
  /** Avatar initials, e.g. "DB". */
  clientInitials: z.string().trim().min(1).max(3),
  /** "She" / "He": used in "She may ask". */
  clientPronoun: z.enum(["She", "He", "They"]),
  /** How the client behaves on this call (1–2 lines). */
  clientMood: md,
  level: z.number().int().min(1).max(3),
  minutes: z.string().min(1),
  /** The story so far (the scene the call happens in). */
  storySoFar: md,
  /** "What you know before the call". */
  facts: z.array(z.object({ label: z.string().min(1), value: md, warn: z.boolean().default(false) })).min(1),
  yourGoal: md,
  mayAsk: z.array(md).default([]),
  script: z.array(z.object({ step: z.string().min(1), line: md })).default([]),
  whatGood: z.array(md).default([]),
});
export type CardPublic = z.infer<typeof cardPublic>;

// ── Library (content/library/*.yaml) ───────────────────────────────────────────────────────────

/** Library sections: frameworks, templates (A1–A13), AI prompts (B1–B8), glossary, resources. */
export const LIBRARY_KINDS = ["framework", "template", "prompt", "glossary", "resource"] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];
export const LIBRARY_KIND_LABELS: Record<LibraryKind, string> = {
  framework: "Frameworks",
  template: "Templates",
  prompt: "AI prompts",
  glossary: "Glossary",
  resource: "Resources",
};

/** One Library page, e.g. "A1 · Pre-call card". Uses the lesson blocks (no `recall` / `field`). */
export const libraryEntry = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
  kind: z.enum(LIBRARY_KINDS),
  /** e.g. "A1" or "§3.2", shown as a small tag. */
  ref: text.optional(),
  title: text,
  /** One line, shown in the list. */
  summary: md,
  /** The first day it's used (shown as "From Day N"). */
  day: z.number().int().min(1).max(65).optional(),
  blocks: z.array(contentBlock).min(1),
});
export type LibraryEntry = z.infer<typeof libraryEntry>;

// ── The Client Readiness Model (content/plan.yaml) ───────────────────────────────────────────────

export const behaviourId = z.string().regex(/^[UCOS]\d$/);

export const readinessPillar = z.object({ id: z.enum(PILLARS), name: z.string().min(1), summary: md });
export const behaviour = z.object({
  id: behaviourId,
  pillar: z.enum(PILLARS),
  name: z.string().min(1),
  soundsLike: md,
  watchOut: md,
});
export type Behaviour = z.infer<typeof behaviour>;
export const scaleLevel = z.object({ score: z.number().int().min(1).max(5), meaning: md });
export const rubricCriterion = z.object({
  number: z.number().int().min(1).max(11),
  name: z.string().min(1),
  pillar: z.enum(PILLARS),
  /** What 1 (needs work), 3 (solid) and 5 (excellent) mean (PDF §6); 2 and 4 sit between. */
  anchors: z.object({ one: md, three: md, five: md }),
});

/** Pillars, behaviours, the 1–5 self-rating scale and the call rubric: shared by every lesson. */
export const readinessModel = z.object({
  pillars: z.array(readinessPillar).length(4),
  behaviours: z.array(behaviour).length(14),
  scale: z.array(scaleLevel).length(5),
  rubric: z.array(rubricCriterion).length(11),
});
export type ReadinessModel = z.infer<typeof readinessModel>;

export const QUESTION_TYPES = ["mcq", "scenario", "written"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const questionSource = z.object({
  /** A passage quoted from the PDF (content:check finds it in the PDF text). */
  quote: z.string().min(10),
  page: pdfPage,
});

export const questionOption = z.object({ text: md, correct: z.boolean(), explanation: md });

/** A quiz or assessment question with its answers (content files and server only). */
export const question = z.object({
  id: z.string().regex(/^(D\d{2}|A\d{2})-\d{2}$/),
  type: z.enum(QUESTION_TYPES),
  stem: md,
  /** Scenario questions: what the client says. */
  clientLine: md.optional(),
  options: z.array(questionOption).optional(),
  /** Written questions: the model answer and 2–3 scoring points the AI judges against (§7). */
  modelAnswer: md.optional(),
  scoringPoints: z.array(z.string().min(1)).optional(),
  source: questionSource,
});
export type Question = z.infer<typeof question>;
