/**
 * Local demo data for the manager screens: three engineers on priya@test.local's Platform team with
 * realistic history (docs/CONTEXT.md). Run after `pnpm db:seed` and `pnpm content:import`, with the
 * API and worker running (`pnpm dev`).
 *
 * Every learning row is written by the real API, signed in as each engineer through the test login:
 * lessons, daily quizzes, assessments, scorecards, then Sara's check-in notes and Priya's check-in. Plain SQL (owner
 * connection, local only) does only what the API can't: create the demo users, their enrollments and
 * team membership, clear their activity so a re-run gives the same state, read which option is correct
 * (so a wrong answer is wrong on purpose), and move timestamps into the past.
 *
 * Refuses to run unless DIRECT_URL and the API are local. Touches only the @test.local users below.
 */
import pg from "pg";
import { LESSON_TEXT, PROOF, reflectText, ROUND_FIXES } from "./lib/demo-text.js";
import { loadLocalEnv } from "./lib/env.js";
import { firstRow } from "./lib/first-row.js";
import type {
  AssessmentViewResponse,
  DayViewResponse,
  Lesson,
  LessonEntry,
  QuizViewResponse,
  TeamResponse,
} from "@portal/contracts";

loadLocalEnv();

const url = process.env.DIRECT_URL ?? "";
if (!/@(127\.0\.0\.1|localhost):/.test(url)) {
  console.error("Demo seed refused: DIRECT_URL is not a local database.");
  process.exit(1);
}
const API = process.env.DEMO_API_URL ?? "http://localhost:4101";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(API)) {
  console.error("Demo seed refused: the API URL is not local.");
  process.exit(1);
}
// State-changing requests need the portal's own Origin and the CSRF header (common/csrf.guard.ts).
const ORIGIN = process.env.PORTAL_ORIGIN ?? "http://localhost:4100";
const CSRF = { "x-portal-request": "1" };

const DOMAIN = "test.local";
const TEAM = "Platform";
const MANAGER = `priya@${DOMAIN}`;
const HOUR = 3_600_000;
const DAY_MS = 24 * HOUR;
const SCORE_STALL_MS = 120_000;
const PILLAR_OF: Readonly<Record<string, string>> = {
  U: "understand",
  C: "communicate",
  O: "own",
  S: "stand_firm",
};

// ── The demo engineers ──────────────────────────────────────────────────────────────────────────

interface Persona {
  key: string;
  name: string;
  /** Days before today the plan started. */
  startedDaysAgo: number;
  /** Day → when it was completed, in days before now (fractions allowed). */
  schedule: Readonly<Record<number, number>>;
  /** Assessment day → [correct choice answers out of 8, taken how many days before now]. */
  assessments: Readonly<Record<number, readonly [correct: number, daysAgo: number]>>;
  /** Day-1 baseline, behaviour → 1–5 (all 14). */
  baseline: Readonly<Record<string, number>>;
  /** Friday scorecards: behaviour → 1–5 (missing ones default to 3). */
  scorecard: Readonly<Record<string, number>>;
  /** Mock-log self-scores: a base level; later days score a little higher. */
  rubricBase: number;
  /** Share of daily-quiz choice questions answered correctly. */
  quizAccuracy: number;
  /** How many sentences of the model answer a written answer keeps (1 = short; 9 = the whole answer). */
  writtenDepth: number;
}

const ALL_THREES = Object.fromEntries(
  ["U1", "U2", "U3", "U4", "C1", "C2", "C3", "C4", "O1", "O2", "O3", "O4", "S1", "S2"].map((id) => [id, 3]),
);

const PERSONAS: readonly Persona[] = [
  {
    key: "kavya",
    name: "Kavya Iyer",
    startedDaysAgo: 19,
    // Day 10 yesterday, the failed Week 2 assessment this morning, then Days 11–12.
    schedule: { 1: 19, 2: 18, 3: 17, 4: 16, 5: 15, 6: 12, 7: 11, 8: 8, 9: 4, 10: 1.1, 11: 0.3, 12: 0.1 },
    assessments: { 5: [6, 14.9], 10: [3, 0.4] },
    baseline: { ...ALL_THREES, U3: 2, C2: 2, O1: 2, O2: 2, O3: 2 },
    scorecard: { C1: 3, C4: 4, C2: 4, O3: 2 },
    rubricBase: 3,
    quizAccuracy: 0.7,
    writtenDepth: 1,
  },
  {
    key: "dev",
    name: "Dev Malhotra",
    startedDaysAgo: 35,
    // Fell behind after Week 2; Day 10 done 12 days ago and no check-in yet.
    schedule: { 1: 35, 2: 34, 3: 33, 4: 32, 5: 31, 6: 28, 7: 27, 8: 25, 9: 20, 10: 12, 11: 10 },
    assessments: { 5: [6, 30.9], 10: [5, 11.9] },
    baseline: { ...ALL_THREES, U4: 2, C1: 2, C4: 2, O2: 2, S1: 2, S2: 2 },
    scorecard: { C1: 3, C4: 3, C2: 3, O3: 3 },
    rubricBase: 2.5,
    quizAccuracy: 0.6,
    writtenDepth: 2,
  },
  {
    key: "sara",
    name: "Sara Khan",
    startedDaysAgo: 31,
    schedule: {
      1: 31,
      2: 30,
      3: 29,
      4: 28,
      5: 27,
      6: 24,
      7: 23,
      8: 22,
      9: 21,
      10: 20,
      11: 17,
      12: 16,
      13: 15,
      14: 14,
      15: 13,
      16: 7,
      17: 6,
      18: 5,
      19: 3,
      20: 1.5,
    },
    assessments: { 5: [7, 26.9], 10: [7, 19.9], 15: [6, 12.9], 20: [8, 1.4] },
    baseline: { ...ALL_THREES, S2: 2 },
    scorecard: { C1: 4, C4: 4, C2: 4, O3: 4, U1: 4, U2: 4, U4: 4, O4: 4, S1: 3 },
    rubricBase: 3.5,
    quizAccuracy: 0.85,
    writtenDepth: 9,
  },
];

const emailOf = (key: string) => `${key}@${DOMAIN}`;

// ── Small helpers ───────────────────────────────────────────────────────────────────────────────

/** Deterministic 0–1 from a string, so a re-run makes the same choices. */
function chance(seed: string): number {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return ((hash >>> 0) % 10_000) / 10_000;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** YYYY-MM-DD in local time. */
function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The first `count` sentences of a model answer, as an engineer's own answer. */
function sentences(text: string, count: number): string {
  const parts = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  return parts.slice(0, Math.max(1, count)).join(" ");
}

// ── API client (one signed-in user) ─────────────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly code: string,
  ) {
    super(`${path} → ${status} ${code}`);
  }
}

class Session {
  private constructor(private readonly cookie: string) {}

  /** Test login (auth/dev-login.controller.ts). The session cookie stays in memory and is never printed. */
  static async signIn(email: string): Promise<Session> {
    for (;;) {
      const response = await fetch(`${API}/api/auth/dev-login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN, ...CSRF },
        body: JSON.stringify({ email }),
      });
      if (response.status === 429) {
        await waitForRateLimit(response);
        continue;
      }
      if (!response.ok) throw new ApiError(response.status, "/api/auth/dev-login", await errorCode(response));
      const cookie = response.headers
        .getSetCookie()
        .map((line) => line.split(";")[0] ?? "")
        .find((pair) => pair.startsWith("cr_session="));
      if (!cookie) throw new Error(`Sign-in for ${email} returned no session cookie.`);
      return new Session(cookie);
    }
  }

  get<T>(path: string): Promise<T> {
    return this.send<T>("GET", path);
  }

  post<T>(path: string, body: unknown = {}): Promise<T> {
    return this.send<T>("POST", path, body);
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.send<T>("PUT", path, body);
  }

  private async send<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (;;) {
      const response = await fetch(`${API}/api${path}`, {
        method,
        headers: {
          cookie: this.cookie,
          ...(method === "GET" ? {} : { "content-type": "application/json", origin: ORIGIN, ...CSRF }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      // The API allows 300 requests a minute per route; the demo makes several hundred.
      if (response.status === 429) {
        await waitForRateLimit(response);
        continue;
      }
      if (!response.ok) throw new ApiError(response.status, path, await errorCode(response));
      return (await response.json()) as T;
    }
  }
}

async function waitForRateLimit(response: Response): Promise<void> {
  const seconds = Number(response.headers.get("retry-after") ?? "5");
  console.warn(`  rate limited, waiting ${seconds}s…`);
  await sleep((Number.isFinite(seconds) && seconds > 0 ? seconds : 5) * 1000 + 250);
}

/** The error's code only (never the body text, which could echo input). */
async function errorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { code?: unknown }; code?: unknown };
    const code = body.error?.code ?? body.code;
    return typeof code === "string" ? code : "";
  } catch {
    return "";
  }
}

// ── Database (owner connection) ─────────────────────────────────────────────────────────────────

interface StoredOption {
  correct: boolean;
}
interface StoredQuestion {
  type: "mcq" | "scenario" | "written";
  options?: StoredOption[];
  modelAnswer?: string;
}

/** The attempt's questions with their answers, by position (the API hides them until answered). */
async function attemptQuestions(db: pg.Client, attemptId: string): Promise<Map<number, StoredQuestion>> {
  const rows = await db.query<{ position: number; question_data: StoredQuestion }>(
    "SELECT position, question_data FROM quiz_items WHERE attempt_id = $1",
    [attemptId],
  );
  return new Map(rows.rows.map((row) => [row.position, row.question_data]));
}

/** Create or update the demo users, their enrollments and team membership; clear their activity. */
async function prepareUsers(db: pg.Client): Promise<Map<string, string>> {
  const content = firstRow(
    await db.query<{ count: number }>("SELECT count(*)::int AS count FROM content_days WHERE day <= 20"),
    "content days",
  );
  if (content.count < 20) throw new Error("Days 1–20 aren't imported: run pnpm content:import first.");
  const team = (
    await db.query<{ id: string }>(
      `SELECT t.id FROM teams t JOIN team_managers m ON m.team_id = t.id JOIN users u ON u.id = m.user_id
        WHERE t.name = $1 AND u.email = $2`,
      [TEAM, MANAGER],
    )
  ).rows[0];
  if (!team) throw new Error(`${MANAGER} doesn't manage the ${TEAM} team: run pnpm db:seed first.`);

  const ids = new Map<string, string>();
  await db.query("BEGIN");
  try {
    for (const persona of PERSONAS) {
      const user = firstRow(
        await db.query<{ id: string }>(
          `INSERT INTO users (email, name, role, status) VALUES ($1, $2, 'engineer', 'active')
           ON CONFLICT (email) DO UPDATE SET name = excluded.name, role = 'engineer', status = 'active'
           RETURNING id`,
          [emailOf(persona.key), persona.name],
        ),
        `user ${persona.key}`,
      );
      ids.set(persona.key, user.id);
      await db.query(
        `INSERT INTO team_members (user_id, team_id) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET team_id = excluded.team_id`,
        [user.id, team.id],
      );
      await db.query(
        `INSERT INTO enrollments (user_id, start_date) VALUES ($1, CURRENT_DATE - $2::int)
         ON CONFLICT (user_id, cycle_no) DO UPDATE SET start_date = excluded.start_date, status = 'active'`,
        [user.id, persona.startedDaysAgo],
      );
      await db.query(
        "DELETE FROM pauses WHERE enrollment_id IN (SELECT id FROM enrollments WHERE user_id = $1)",
        [user.id],
      );
      // Children before parents (ai_scores point at quiz_items).
      for (const table of [
        "ai_scores",
        "quiz_items",
        "quiz_attempts",
        "rubric_scores",
        "scorecards",
        "step_entries",
        "day_progress",
        "manual_unlocks",
        "checkins",
        "gate_recaps",
        "gate_results",
        "red_flags",
      ]) {
        await db.query(`DELETE FROM ${table} WHERE user_id = $1`, [user.id]);
      }
      // Manager email items about this engineer (the hourly run saves them again as needed).
      await db.query("DELETE FROM email_log WHERE payload->>'engineerId' = $1", [user.id]);
    }
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
  return ids;
}

// ── Lessons ─────────────────────────────────────────────────────────────────────────────────────

function rubricFor(persona: Persona, day: number): Record<string, number | null> {
  const rubric: Record<string, number | null> = {};
  for (let criterion = 1; criterion <= 10; criterion++) {
    const roll = chance(`${persona.key}/${day}/rubric/${criterion}`);
    // Criteria that rarely come up on early calls are n/a now and then.
    if ([7, 9].includes(criterion) && roll < 0.4) {
      rubric[String(criterion)] = null;
      continue;
    }
    const level = persona.rubricBase + day / 20 + (roll - 0.5) * 1.6;
    rubric[String(criterion)] = Math.min(5, Math.max(1, Math.round(level)));
  }
  return rubric;
}

function entryFor(persona: Persona, day: number, lesson: Lesson, behaviours: readonly string[]): LessonEntry {
  const values: Record<string, string> = {};
  for (const field of lesson.fields) {
    const text = LESSON_TEXT[`${day}/${lesson.id}/${field.id}`] ?? reflectText(day, field.id);
    // Optional fields are skipped now and then, as people do.
    const skip = !field.required && chance(`${persona.key}/${day}/${lesson.id}/${field.id}`) < 0.08;
    if (text && !skip) values[field.id] = text;
    else if (field.required) values[field.id] = text ?? "Done.";
  }
  const ratings: Record<string, number> = {};
  if (lesson.baseline) {
    for (const id of behaviours) ratings[id] = persona.baseline[id] ?? 3;
  }
  if (lesson.scorecard.length > 0) {
    for (const id of lesson.scorecard) ratings[id] = persona.scorecard[id] ?? 3;
    const pillars = new Set(lesson.scorecard.map((id) => PILLAR_OF[id.charAt(0)] ?? ""));
    for (const pillar of pillars)
      values[`proof-${pillar.replaceAll("_", "-")}`] = PROOF[pillar] ?? "See my recap.";
    values.win = LESSON_TEXT[`${day}/win`] ?? "Dana said the recap was exactly what she needed.";
    if (persona.key !== "sara") values.stuck = "Epic access is still out of my hands; I chase it daily.";
  }
  const checked = lesson.checks
    .map((_, index) => index)
    .filter((index) => chance(`${persona.key}/${day}/${lesson.id}/check/${index}`) < 0.75);
  const rounds = Array.from({ length: lesson.rounds ?? 0 }, (_, index) => ({
    score: Math.min(5, Math.round(persona.rubricBase) + (index > 0 ? 1 : 0)),
    fix: ROUND_FIXES[index] ?? "Slow down.",
  }));
  return {
    values,
    checked,
    ratings,
    rounds,
    rubric: lesson.rubric ? rubricFor(persona, day) : {},
    realProject: false,
    livePath: null,
  };
}

// ── Quizzes and assessments ─────────────────────────────────────────────────────────────────────

/** The option to pick: the correct one, or a wrong one on purpose. */
function pick(q: StoredQuestion, correct: boolean): number {
  const options = q.options ?? [];
  const right = Math.max(
    0,
    options.findIndex((option) => option.correct),
  );
  if (correct || options.length < 2) return right;
  return (right + 1) % options.length;
}

function writtenAnswer(persona: Persona, q: StoredQuestion): string {
  return sentences(
    q.modelAnswer ?? "I'd confirm the facts first and reply to Dana with a time.",
    persona.writtenDepth,
  );
}

async function dailyQuiz(session: Session, db: pg.Client, persona: Persona, day: number): Promise<void> {
  const quiz = await session.post<QuizViewResponse>(`/me/days/${day}/quiz`);
  const questions = await attemptQuestions(db, quiz.attemptId);
  for (const item of quiz.items) {
    if (item.result) continue;
    const q = questions.get(item.position);
    if (!q) throw new Error(`Quiz item ${item.position} is missing.`);
    const body =
      q.type === "written"
        ? { text: writtenAnswer(persona, q) }
        : { choice: pick(q, chance(`${persona.key}/${day}/quiz/${item.position}`) < persona.quizAccuracy) };
    await session.post(`/me/quiz/${quiz.attemptId}/items/${item.position}`, body);
  }
}

/** Take the assessment after `day` with exactly `correct` choice answers right (scored later, see `waitForScores`). */
async function assessment(
  session: Session,
  db: pg.Client,
  persona: Persona,
  day: number,
  correct: number,
): Promise<AssessmentViewResponse> {
  const view = await session.post<AssessmentViewResponse>(`/me/assessments/${day}/start`);
  const attempt = view.attempt;
  if (!attempt) throw new Error(`Week ${day / 5} assessment didn't start.`);
  const questions = await attemptQuestions(db, attempt.id);
  let right = 0;
  for (const item of attempt.items) {
    const q = questions.get(item.position);
    if (!q) throw new Error(`Assessment item ${item.position} is missing.`);
    if (item.result) continue;
    let body: { text: string } | { choice: number };
    if (q.type === "written") body = { text: writtenAnswer(persona, q) };
    else {
      body = { choice: pick(q, right < correct) };
      if (right < correct) right++;
    }
    await session.post(`/me/quiz/${attempt.id}/items/${item.position}`, body);
  }
  return session.get<AssessmentViewResponse>(`/me/assessments/${day}`);
}

// ── One engineer's journey ──────────────────────────────────────────────────────────────────────

async function walk(db: pg.Client, persona: Persona, userId: string): Promise<void> {
  const session = await Session.signIn(emailOf(persona.key));
  const days = Object.keys(persona.schedule)
    .map(Number)
    .sort((a, b) => a - b);
  for (const day of days) {
    let view: DayViewResponse;
    try {
      view = await session.get<DayViewResponse>(`/me/days/${day}`);
    } catch (error) {
      // Only without `learning.unlockAll`: a failed assessment locks the next day until a manager opens it.
      if (!(error instanceof ApiError && error.code === "DAY_LOCKED")) throw error;
      await openLockedDay(db, userId, day);
      view = await session.get<DayViewResponse>(`/me/days/${day}`);
    }
    const behaviours = view.model.behaviours.map((behaviour) => behaviour.id);
    for (const lesson of view.lessons) {
      await session.put(`/me/days/${day}/lessons/${lesson.id}`, entryFor(persona, day, lesson, behaviours));
    }
    await dailyQuiz(session, db, persona, day);
    const planned = persona.assessments[day];
    if (planned) await assessment(session, db, persona, day, planned[0]);
  }
}

/**
 * With `learning.unlockAll` off, Kavya's failed Week 2 assessment locks Day 11. Priya opens it with
 * "Open Day 11", which the Unlock offers only once the retake wait is over, so the wait is ended for a
 * moment (it is set again when timestamps are moved).
 */
async function openLockedDay(db: pg.Client, userId: string, day: number): Promise<void> {
  await db.query(
    "UPDATE quiz_attempts SET retake_at = now() - interval '1 minute' WHERE user_id = $1 AND kind = 'assessment' AND passed = false",
    [userId],
  );
  const priya = await Session.signIn(MANAGER);
  await priya.post(`/manager/engineers/${userId}/unlock`, {
    kind: "next_day",
    day,
    reason: "Keep her moving while she prepares the Week 2 retake.",
  });
}

// ── Timestamps ──────────────────────────────────────────────────────────────────────────────────

/** Move one engineer's rows so each day happened on its scheduled date, lessons in order. */
async function shiftTimestamps(db: pg.Client, persona: Persona, userId: string, now: number): Promise<void> {
  const at = (daysAgo: number, minutes = 0) => new Date(now - daysAgo * DAY_MS + minutes * 60_000);
  const rules = firstRow(
    await db.query<{ hours: number }>(
      "SELECT coalesce((SELECT (value #>> '{}')::int FROM settings WHERE key = 'assessment.retakeHours'), 24) AS hours",
    ),
    "retake hours",
  );
  for (const [dayText, daysAgo] of Object.entries(persona.schedule)) {
    const day = Number(dayText);
    const lessons = await db.query<{ id: string; lesson_id: string }>(
      "SELECT id, lesson_id FROM step_entries WHERE user_id = $1 AND day = $2 ORDER BY done_at, id",
      [userId, day],
    );
    // Lessons ~12 minutes apart, the daily quiz in the last 8 minutes before the day is complete.
    const first = -(lessons.rows.length * 12 + 10);
    for (const [index, row] of lessons.rows.entries()) {
      const doneAt = at(daysAgo, first + index * 12);
      await db.query("UPDATE step_entries SET done_at = $2, updated_at = $2 WHERE id = $1", [row.id, doneAt]);
      await db.query(
        `UPDATE ai_scores SET created_at = $4, updated_at = $4, scored_at = CASE WHEN scored_at IS NULL THEN NULL ELSE $4::timestamptz + interval '1 minute' END
          WHERE user_id = $1 AND day = $2 AND target = 'lesson' AND lesson_id = $3`,
        [userId, day, row.lesson_id, doneAt],
      );
    }
    await db.query("UPDATE rubric_scores SET created_at = $3 WHERE user_id = $1 AND day = $2", [
      userId,
      day,
      at(daysAgo, -20),
    ]);
    await db.query(
      "UPDATE day_progress SET opened_at = $3, completed_at = CASE WHEN completed_at IS NULL THEN NULL ELSE $4::timestamptz END WHERE user_id = $1 AND day = $2",
      [userId, day, at(daysAgo, first - 2), at(daysAgo)],
    );
    await shiftAttempt(db, userId, "daily", day, at(daysAgo, -8), null);
    if (day % 5 === 0) {
      await db.query(
        "UPDATE scorecards SET submitted_at = $3, updated_at = $3 WHERE user_id = $1 AND week = $2",
        [userId, day / 5, at(daysAgo, -12)],
      );
    }
    const planned = persona.assessments[day];
    if (planned) await shiftAttempt(db, userId, "assessment", day, at(planned[1], -15), rules.hours);
  }
}

/** Start at `startedAt`, one answer a minute; a failed assessment's retake opens `retakeHours` later. */
async function shiftAttempt(
  db: pg.Client,
  userId: string,
  kind: "daily" | "assessment",
  day: number,
  startedAt: Date,
  retakeHours: number | null,
): Promise<void> {
  const attempt = (
    await db.query<{ id: string; passed: boolean | null; items: number }>(
      `SELECT a.id, a.passed, (SELECT count(*)::int FROM quiz_items i WHERE i.attempt_id = a.id) AS items
         FROM quiz_attempts a WHERE a.user_id = $1 AND a.kind = $2 AND a.day = $3 ORDER BY a.attempt DESC LIMIT 1`,
      [userId, kind, day],
    )
  ).rows[0];
  if (!attempt) return;
  const minute = 60_000;
  const completedAt = new Date(startedAt.getTime() + (attempt.items + 1) * minute);
  const retakeAt =
    retakeHours !== null && attempt.passed === false
      ? new Date(completedAt.getTime() + retakeHours * HOUR)
      : null;
  await db.query(
    "UPDATE quiz_attempts SET started_at = $2, completed_at = $3, retake_at = $4 WHERE id = $1",
    [attempt.id, startedAt, completedAt, retakeAt],
  );
  await db.query(
    "UPDATE quiz_items SET answered_at = $2::timestamptz + (position + 1) * interval '1 minute' WHERE attempt_id = $1",
    [attempt.id, startedAt],
  );
  await db.query(
    `UPDATE ai_scores s SET created_at = i.answered_at, updated_at = i.answered_at,
            scored_at = CASE WHEN s.scored_at IS NULL THEN NULL ELSE i.answered_at + interval '1 minute' END
       FROM quiz_items i WHERE s.quiz_item_id = i.id AND i.attempt_id = $1`,
    [attempt.id],
  );
}

// ── Priya: the check-in ────────────────────────────────────────────────────────────────────────

/** Sara's own check-in notes, then Priya records her Day-10 check-in. */
async function managerWork(db: pg.Client, ids: Map<string, string>, now: number): Promise<void> {
  const priya = await Session.signIn(MANAGER);

  const sara = ids.get("sara");
  const saraDay10 = PERSONAS.find((p) => p.key === "sara")?.schedule[10];
  if (sara && saraDay10 !== undefined) {
    const heldOn = new Date(now - (saraDay10 - 2) * DAY_MS);
    // Sara's own notes for the check-in (the engineer writes them before the call).
    await db.query(
      `INSERT INTO checkin_preps (enrollment_id, user_id, after_day, spot_check, stuck, support)
       SELECT id, user_id, 10, $2, $3, $4 FROM enrollments WHERE user_id = $1`,
      [
        sara,
        "Asked for a 30-second status on Epic access: answer first, gave a date, named the risk.",
        "Nothing blocking; wants more practice pushing back on dates.",
        "Shadow my Thursday call with Lakeside IT next week.",
      ],
    );
    await priya.put(`/manager/engineers/${sara}/checkins/10`, {
      heldOn: isoDay(heldOn),
      rag: "green",
      note: "On pace, both assessments passed, recaps are client-ready.",
    });
    await db.query(
      "UPDATE checkins SET created_at = $2, updated_at = $2 WHERE user_id = $1 AND after_day = 10",
      [sara, heldOn],
    );
  }
}

/**
 * Wait until the worker has scored every demo answer (write lessons, daily-quiz and assessment written
 * answers), so timestamps can be moved. The worker takes 15 scoring jobs a
 * minute (SCORING_LIMITER), so ~100 answers take several minutes; give up when nothing moved for 2 minutes.
 */
async function waitForScores(db: pg.Client, ids: readonly string[]): Promise<number> {
  let last = Number.POSITIVE_INFINITY;
  let lastChange = Date.now();
  let lastReport = 0;
  for (;;) {
    const row = firstRow(
      await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM ai_scores WHERE user_id = ANY($1::uuid[]) AND status = 'pending'",
        [ids],
      ),
      "pending scores",
    );
    if (row.count === 0) return 0;
    if (row.count < last) {
      last = row.count;
      lastChange = Date.now();
    }
    if (Date.now() - lastChange > SCORE_STALL_MS) return row.count;
    if (Date.now() - lastReport > 30_000) {
      console.warn(`  waiting for the worker: ${row.count} answers left to score (15 a minute)…`);
      lastReport = Date.now();
    }
    await sleep(2000);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const health = await fetch(`${API}/api/health`).catch(() => null);
  if (!health?.ok) throw new Error(`The API isn't answering on ${API}: start it with pnpm dev.`);

  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    const ids = await prepareUsers(db);
    for (const persona of PERSONAS) {
      const userId = ids.get(persona.key);
      if (!userId) continue;
      console.warn(`${persona.name}: Days 1–${Math.max(...Object.keys(persona.schedule).map(Number))}…`);
      await walk(db, persona, userId);
    }
    const pending = await waitForScores(db, [...ids.values()]);
    if (pending > 0)
      console.warn(
        `${pending} answers are still being scored (is the worker running?): they stay "being scored" and aren't reviewed.`,
      );
    const now = Date.now();
    for (const persona of PERSONAS) {
      const userId = ids.get(persona.key);
      if (userId) await shiftTimestamps(db, persona, userId, now);
    }
    await managerWork(db, ids, now);
    await summary(ids);
  } finally {
    await db.end();
  }
}

async function summary(ids: Map<string, string>): Promise<void> {
  const priya = await Session.signIn(MANAGER);
  const team = await priya.get<TeamResponse>("/manager/team");
  const demo = new Set(ids.values());
  console.warn("\nDemo engineers on the Platform team (sign in as priya@test.local to see them):");
  for (const engineer of team.engineers.filter((e) => demo.has(e.id))) {
    const pace = engineer.pace
      ? `${engineer.pace.status.replace("_", " ")} (${engineer.pace.difference})`
      : "-";
    const unlock = engineer.unlock ? ` · Unlock: ${engineer.unlock.label}` : "";
    console.warn(
      `  ${engineer.name.padEnd(13)} ${String(engineer.daysDone).padStart(2)} days done · pace ${pace} · next: ${engineer.next ?? "-"}${unlock}`,
    );
  }
  console.warn("Priya's tasks:");
  for (const task of team.tasks.filter((t) => demo.has(t.engineer.id))) {
    console.warn(`  [${task.status}] ${task.title} · ${task.detail}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
