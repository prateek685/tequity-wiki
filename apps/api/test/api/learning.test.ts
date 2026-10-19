/**
 * Learning journey end to end (real NestJS app, local Postgres): a day opens once it is imported
 * (no review), then an engineer works through Day 1 in the course player (lessons in order, prompt
 * copy, daily quiz), Day 2 opens with the baseline and recalled answers, and the outline follows.
 * Runs with `learning.unlockAll` off, then checks what changes when it is on.
 * Uses the fixture lesson from test/content-fixtures.ts and the dev login.
 */
import { Test } from "@nestjs/testing";
import {
  answerQuizItemResponse,
  apiErrorBody,
  courseOutlineResponse,
  CSRF_HEADER,
  dayViewResponse,
  lessonState,
  myPlanResponse,
  quizViewResponse,
} from "@portal/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../src/app.module.js";
import { isoFromDate } from "../../src/common/dates.js";
import { parseEnv } from "../../src/config/env.js";
import { configureHttp } from "../../src/http.js";
import {
  BEHAVIOUR_IDS,
  CARD_ID,
  CARD_PROMPT,
  ContentFixtures,
  DAY1_LESSONS,
  QUESTION_IDS,
  QUESTIONS,
  RETIRED_QUESTION_ID,
  WRITE_SCORING,
} from "../content-fixtures.js";
import { Fixtures } from "../fixtures.js";
import type { NestExpressApplication } from "@nestjs/platform-express";

const env = parseEnv(process.env);
const fx = new Fixtures("lj");
const content = new ContentFixtures();
const ORIGIN = env.PORTAL_ORIGIN;
let app: NestExpressApplication;
const cookies: Record<string, string> = {};

async function signIn(key: string): Promise<string> {
  const response = await request(app.getHttpServer())
    .post("/api/auth/dev-login")
    .set("Origin", ORIGIN)
    .set(CSRF_HEADER, "1")
    .send({ email: fx.emailOf(key) });
  expect(response.status).toBe(200);
  const cookie = response.get("Set-Cookie")?.find((value) => value.startsWith("cr_session="));
  if (!cookie) throw new Error("no session cookie");
  return cookie.split(";")[0] ?? "";
}

const get = (path: string, who: string) =>
  request(app.getHttpServer())
    .get(path)
    .set("Cookie", cookies[who] ?? "");
function send(method: "post" | "put", path: string, who: string, body: object = {}) {
  const server = request(app.getHttpServer());
  const call = method === "post" ? server.post(path) : server.put(path);
  return call
    .set("Cookie", cookies[who] ?? "")
    .set("Origin", ORIGIN)
    .set(CSRF_HEADER, "1")
    .send(body);
}

const errorCode = (body: unknown) => apiErrorBody.parse(body).code;

async function auditCount(action: string, entityId: string): Promise<number> {
  const { rows } = await fx.owner.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM audit_log WHERE action = $1 AND entity_id = $2 AND actor_id = ANY($3::uuid[])",
    [action, entityId, [fx.id("eng")]],
  );
  return Number(rows[0]?.n ?? 0);
}

beforeAll(async () => {
  if (process.env.DEV_LOGIN_ENABLED !== "true")
    throw new Error("Set DEV_LOGIN_ENABLED=true in apps/api/.env");
  await fx.user("manager", "manager", "active");
  await fx.user("eng", "engineer", "active");
  const yesterday = isoFromDate(new Date(Date.now() - 86_400_000));
  await fx.owner.query("INSERT INTO enrollments (user_id, start_date) VALUES ($1, $2)", [
    fx.id("eng"),
    yesterday,
  ]);
  await content.install({ day1Imported: false });

  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication<NestExpressApplication>({ logger: false });
  configureHttp(app);
  await app.init();
  for (const key of ["manager", "eng"]) cookies[key] = await signIn(key);
});

afterAll(async () => {
  await app.close();
  await fx.cleanup();
  await content.restore();
});

describe("engineer Day 1", () => {
  it("is not ready until the lesson is imported, then opens without any review", async () => {
    const day = await get("/api/me/days/1", "eng");
    expect(day.status).toBe(422);
    expect(errorCode(day.body)).toBe("DAY_NOT_READY");
    const plan = myPlanResponse.parse((await get("/api/me/plan", "eng")).body);
    expect(plan.days[0]).toMatchObject({ day: 1, status: "not_ready" });
    expect(plan.currentDay).toBeNull();

    await content.importDay(1);
    expect((await get("/api/me/days/1", "eng")).status).toBe(200);
  });

  it("opens Day 1 with its lessons in order, no prompt and no answers", async () => {
    const plan = myPlanResponse.parse((await get("/api/me/plan", "eng")).body);
    expect(plan.currentDay).toBe(1);
    expect(plan.days).toHaveLength(65);
    expect(plan.pace?.status).toBe("on_pace");
    expect(plan.days[1]).toMatchObject({ day: 2, status: "locked", lockReason: "previous_day" });

    const response = await get("/api/me/days/1", "eng");
    expect(response.status).toBe(200);
    const day = dayViewResponse.parse(response.body);
    expect(day).toMatchObject({
      status: "open",
      storyDate: "Monday, March 2",
      minutes: "About 60 min",
      intro: "Intro for day 1.",
      block: { number: 1, title: "Test block" },
      quiz: { status: "locked", attemptId: null },
      baseline: null,
      recalls: [],
      unlockAll: false,
    });
    expect(day.model.behaviours).toHaveLength(14);
    expect(day.lessons.map((item) => item.id)).toEqual([...DAY1_LESSONS]);
    expect(day.cards.map((card) => card.id)).toEqual([CARD_ID]);
    expect(day.progress.map((item) => item.done)).toEqual([false, false, false, false]);
    expect(JSON.stringify(response.body)).not.toContain(CARD_PROMPT);
    const { rows } = await fx.owner.query("SELECT 1 FROM day_progress WHERE user_id = $1 AND day = 1", [
      fx.id("eng"),
    ]);
    expect(rows).toHaveLength(1);
  });

  it("rejects a locked day, a locked lesson, an unknown lesson and a quiz started before the lessons", async () => {
    const day2 = await get("/api/me/days/2", "eng");
    expect(day2.status).toBe(403);
    expect(errorCode(day2.body)).toBe("DAY_LOCKED");
    expect(errorCode((await send("put", "/api/me/days/2/lessons/look-back", "eng", {})).body)).toBe(
      "DAY_LOCKED",
    );
    expect(errorCode((await send("post", "/api/me/days/2/lessons/look-back/prompt-copy", "eng")).body)).toBe(
      "DAY_LOCKED",
    );
    const unknown = await send("put", "/api/me/days/1/lessons/no-such-lesson", "eng", {});
    expect(unknown.status).toBe(422);
    expect(errorCode(unknown.body)).toBe("LESSON_NOT_IN_DAY");
    const early = await send("post", "/api/me/days/1/quiz", "eng");
    expect(early.status).toBe(422);
    expect(errorCode(early.body)).toBe("STEPS_NOT_DONE");
  });

  it("copies the mock lesson's card prompt and audits it", async () => {
    const response = await send("post", "/api/me/days/1/lessons/call/prompt-copy", "eng");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ prompt: CARD_PROMPT });
    expect(await auditCount("prompt.copied", CARD_ID)).toBe(1);
    expect((await send("post", "/api/me/days/1/lessons/meet/prompt-copy", "eng")).status).toBe(404);
    expect((await send("post", "/api/me/days/1/lessons/call/prompt-copy", "manager")).status).toBe(403);
  });

  it("checks each lesson's entry", async () => {
    const missing = await send("put", "/api/me/days/1/lessons/after-call", "eng", {
      values: { "fix-next": "x" },
    });
    expect(missing.status).toBe(400);
    const unknownField = await send("put", "/api/me/days/1/lessons/meet", "eng", { values: { nope: "x" } });
    expect(unknownField.status).toBe(400);
    const partial = await send("put", "/api/me/days/1/lessons/baseline", "eng", { ratings: { U1: 3 } });
    expect(partial.status).toBe(400);
    const badTick = await send("put", "/api/me/days/1/lessons/after-call", "eng", {
      values: { "went-well": "x" },
      checked: [5],
    });
    expect(badTick.status).toBe(400);
  });

  it("saves the lessons in any order (last first) and allows saving a done lesson again", async () => {
    const baseline = Object.fromEntries(BEHAVIOUR_IDS.map((id, index) => [id, (index % 5) + 1]));
    const bodies: Record<string, object> = {
      meet: {},
      call: {},
      "after-call": {
        values: { "went-well": "Clear opening." },
        checked: [0, 1],
        rubric: { "1": 4, "2": null },
      },
      baseline: { ratings: baseline },
    };
    for (const id of [...DAY1_LESSONS].reverse()) {
      const response = await send("put", `/api/me/days/1/lessons/${id}`, "eng", bodies[id] ?? {});
      expect(response.status).toBe(200);
      expect(lessonState.parse(response.body)).toMatchObject({ id, done: true });
    }
    expect((await send("put", "/api/me/days/1/lessons/meet", "eng", {})).status).toBe(200);
    const { rows } = await fx.owner.query<{ criterion: number; score: number | null }>(
      "SELECT criterion, score FROM rubric_scores WHERE user_id = $1 ORDER BY criterion",
      [fx.id("eng")],
    );
    expect(rows).toEqual([
      { criterion: 1, score: 4 },
      { criterion: 2, score: null },
    ]);
    const day = dayViewResponse.parse((await get("/api/me/days/1", "eng")).body);
    expect(day.quiz.status).toBe("ready");
    expect(day.progress.every((item) => item.done)).toBe(true);
    expect(day.progress.find((item) => item.id === "after-call")?.entry).toEqual({
      values: { "went-well": "Clear opening." },
      checked: [0, 1],
      ratings: {},
      rounds: [],
      rubric: { "1": 4, "2": null },
      realProject: false,
      livePath: null,
    });
    // Lessons without a scoring guide never carry an AI score or a model answer.
    expect(day.progress.every((item) => item.aiScore === null && item.modelAnswer === null)).toBe(true);
    expect(day.baseline).toEqual(baseline);
  });

  it("runs the daily quiz: 5 items, answers once each, then the day is done", async () => {
    const started = await send("post", "/api/me/days/1/quiz", "eng");
    expect(started.status).toBe(200);
    const quiz = quizViewResponse.parse(started.body);
    expect(quiz.items.map((item) => item.type)).toEqual(["mcq", "mcq", "mcq", "scenario", "written"]);
    expect(quiz.items.every((item) => item.result === null)).toBe(true);
    expect(JSON.stringify(started.body)).not.toMatch(/explanation|correct|modelAnswer|model answer/i);
    const resumed = quizViewResponse.parse((await send("post", "/api/me/days/1/quiz", "eng")).body);
    expect(resumed.attemptId).toBe(quiz.attemptId);

    const { rows } = await fx.owner.query<{ position: number; question_id: string }>(
      "SELECT position, question_id FROM quiz_items WHERE attempt_id = $1 ORDER BY position",
      [quiz.attemptId],
    );
    // The quiz draws from every live question of the pool; the retired one is never picked.
    expect(rows.map((row) => row.question_id).sort()).toEqual([...QUESTION_IDS]);
    expect(rows.map((row) => row.question_id)).not.toContain(RETIRED_QUESTION_ID);
    let last = answerQuizItemResponse.parse({
      result: emptyResult(),
      quizCompleted: false,
      dayCompleted: false,
    });
    const answerRow = async (row: { position: number; question_id: string }) => {
      const q = QUESTIONS.find((item) => item.id === row.question_id);
      if (!q) throw new Error(`unexpected question ${row.question_id}`);
      const body = q.type === "written" ? { text: "My written answer." } : { choice: correctChoice(q) };
      const response = await send(
        "post",
        `/api/me/quiz/${quiz.attemptId}/items/${row.position}`,
        "eng",
        body,
      );
      expect(response.status).toBe(200);
      const parsed = answerQuizItemResponse.parse(response.body);
      if (q.type === "written") {
        expect(parsed.result).toMatchObject({
          scoreStatus: "pending",
          modelAnswer: q.modelAnswer,
          aiScore: { status: "pending", score: null, points: [] },
        });
      } else {
        expect(parsed.result).toMatchObject({ correct: true, correctIndex: correctChoice(q) });
        expect(parsed.result.explanations).toHaveLength(4);
      }
      return parsed;
    };
    for (const row of rows.slice(0, 3)) last = await answerRow(row);
    expect(last).toMatchObject({ quizCompleted: false, dayCompleted: false });
    // The last two answers arrive at the same moment (two tabs, a retry): the day must still complete.
    const finals = await Promise.all(rows.slice(3).map(answerRow));
    expect(finals.some((response) => response.quizCompleted && response.dayCompleted)).toBe(true);

    const again = await send("post", `/api/me/quiz/${quiz.attemptId}/items/0`, "eng", { choice: 0 });
    expect(again.status).toBe(409);
    expect(errorCode(again.body)).toBe("QUIZ_ALREADY_ANSWERED");

    // The written answer was saved with an AI score row, pending at first (only one item is written).
    const { rows: scores } = await fx.owner.query<{ target: string; status: string; day: number }>(
      "SELECT target, status, day FROM ai_scores WHERE user_id = $1",
      [fx.id("eng")],
    );
    expect(scores).toMatchObject([{ target: "quiz_item", day: 1 }]);
    // A running dev worker may already have scored it.
    expect(["pending", "scored"]).toContain(scores[0]?.status);
  });

  it("opens Day 2 once Day 1 is done, with the baseline and the recalled answers", async () => {
    const plan = myPlanResponse.parse((await get("/api/me/plan", "eng")).body);
    expect(plan.days[0]?.status).toBe("done");
    expect(plan.days[1]?.status).toBe("open");
    expect(plan.currentDay).toBe(2);
    expect(plan.pace?.daysDone).toBe(1);
    const day2 = dayViewResponse.parse((await get("/api/me/days/2", "eng")).body);
    expect(day2.baseline).toMatchObject({ U1: 1, C1: 5 });
    expect(day2.recalls).toEqual([
      { day: 1, lesson: "after-call", values: { "went-well": "Clear opening.", "fix-next": "" } },
    ]);
    expect(dayViewResponse.parse((await get("/api/me/days/1", "eng")).body).quiz.status).toBe("done");
  });

  it("sends a write lesson's model answer and AI score only once it is saved", async () => {
    await send("put", "/api/me/days/2/lessons/look-back", "eng", {});
    const before = await get("/api/me/days/2", "eng");
    expect(JSON.stringify(before.body)).not.toContain(WRITE_SCORING.rewrite.modelAnswer);
    expect(JSON.stringify(before.body)).not.toContain(WRITE_SCORING.rewrite.scoringPoints[0]);
    const saved = await send("put", "/api/me/days/2/lessons/rewrite", "eng", {
      values: { answer: "Yes, Friday." },
    });
    expect(lessonState.parse(saved.body)).toMatchObject({
      aiScore: { status: "pending", score: null },
      modelAnswer: WRITE_SCORING.rewrite.modelAnswer,
    });
    const day2 = dayViewResponse.parse((await get("/api/me/days/2", "eng")).body);
    const rewrite = day2.progress.find((item) => item.id === "rewrite");
    expect(rewrite?.modelAnswer).toBe(WRITE_SCORING.rewrite.modelAnswer);
    // Scored in the background (a running dev worker may already have scored it).
    expect(["pending", "scored"]).toContain(rewrite?.aiScore?.status);
  });

  it("checks the scorecard's behaviours", async () => {
    const extra = await send("put", "/api/me/days/2/lessons/friday", "eng", {
      ratings: { C1: 3, C4: 4, U1: 2 },
    });
    expect(extra.status).toBe(400);
    const noProof = await send("put", "/api/me/days/2/lessons/friday", "eng", { ratings: { C1: 3, C4: 4 } });
    expect(noProof.status).toBe(400);
    expect(apiErrorBody.parse(noProof.body).fields).toEqual({
      "values.proof-communicate": "Write one or two lines of proof.",
    });
    const ok = await send("put", "/api/me/days/2/lessons/friday", "eng", {
      ratings: { C1: 3, C4: 4 },
      values: { "proof-communicate": "Opened the sync with the answer." },
    });
    expect(ok.status).toBe(200);
  });

  it("returns the course outline: weeks, days, lessons and statuses", async () => {
    const outline = courseOutlineResponse.parse((await get("/api/me/course", "eng")).body);
    expect(outline).toMatchObject({ currentDay: 2, unlockAll: false });
    expect(outline.phases.map((p) => p.number)).toEqual([1, 2, 3]);
    const week1 = outline.weeks.find((week) => week.number === 1);
    expect(week1).toMatchObject({ title: "Test block", phase: 1 });
    expect(week1?.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5]);
    expect(week1?.days[0]).toMatchObject({
      status: "done",
      storyDate: "Monday, March 2",
      quiz: { status: "done" },
    });
    expect(week1?.days[0]?.lessons.every((item) => item.done)).toBe(true);
    expect(week1?.days[1]).toMatchObject({ status: "open", quiz: { status: "not_ready" } });
    expect(week1?.days[2]).toMatchObject({ day: 3, status: "locked", lockReason: "previous_day" });
  });
});

describe("content review (learning.unlockAll on)", () => {
  beforeAll(async () => {
    await content.setUnlockAll(true);
  });
  afterAll(async () => {
    await content.setUnlockAll(false);
  });

  it("opens lessons out of order and the quiz before the lessons", async () => {
    await fx.owner.query("DELETE FROM step_entries WHERE user_id = $1 AND day = 2", [fx.id("eng")]);
    const day2 = dayViewResponse.parse((await get("/api/me/days/2", "eng")).body);
    expect(day2.unlockAll).toBe(true);
    const out = await send("put", "/api/me/days/2/lessons/friday", "eng", {
      ratings: { C1: 3, C4: 4 },
      values: { "proof-communicate": "Answer first." },
    });
    expect(out.status).toBe(200);
    // Day 2 has no fixture questions: the quiz isn't locked, it just can't be supplied.
    const quiz = await send("post", "/api/me/days/2/quiz", "eng");
    expect(errorCode(quiz.body)).toBe("QUIZ_NOT_READY");
    const outline = courseOutlineResponse.parse((await get("/api/me/course", "eng")).body);
    expect(outline.unlockAll).toBe(true);
  });
});

function correctChoice(q: (typeof QUESTIONS)[number]): number {
  return "options" in q ? q.options.findIndex((option) => option.correct) : -1;
}

function emptyResult() {
  return {
    choice: null,
    correct: null,
    correctIndex: null,
    explanations: [],
    text: null,
    modelAnswer: null,
    scoreStatus: "not_applicable" as const,
    aiScore: null,
  };
}
