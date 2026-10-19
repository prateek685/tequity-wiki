/**
 * Weekly assessment end to end (real NestJS app, local Postgres): locked until Days 1–5 are done, then
 * start (double click → one attempt), answer, fail, wait for the retake, retake with fresh questions,
 * pass, and Day 6 opens. Uses the Day-5 fixture pool from test/content-fixtures.ts and the dev login.
 */
import { Test } from "@nestjs/testing";
import {
  answerQuizItemResponse,
  apiErrorBody,
  assessmentViewResponse,
  type AssessmentViewResponse,
  courseOutlineResponse,
  CSRF_HEADER,
  myPlanResponse,
} from "@portal/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../src/app.module.js";
import { isoFromDate } from "../../src/common/dates.js";
import { parseEnv } from "../../src/config/env.js";
import { configureHttp } from "../../src/http.js";
import { ASSESSMENT_CORRECT_CHOICE, ASSESSMENT_QUESTIONS, ContentFixtures } from "../content-fixtures.js";
import { Fixtures } from "../fixtures.js";
import type { NestExpressApplication } from "@nestjs/platform-express";

const env = parseEnv(process.env);
const fx = new Fixtures("as");
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

const get = (path: string, who = "eng") =>
  request(app.getHttpServer())
    .get(path)
    .set("Cookie", cookies[who] ?? "");
const post = (path: string, body: object = {}, who = "eng") =>
  request(app.getHttpServer())
    .post(path)
    .set("Cookie", cookies[who] ?? "")
    .set("Origin", ORIGIN)
    .set(CSRF_HEADER, "1")
    .send(body);

const errorCode = (body: unknown) => apiErrorBody.parse(body).code;
const view = async (): Promise<AssessmentViewResponse> =>
  assessmentViewResponse.parse((await get("/api/me/assessments/5")).body);

/** Question ids of an attempt, by position. */
async function attemptQuestions(attemptId: string): Promise<string[]> {
  const { rows } = await fx.owner.query<{ question_id: string }>(
    "SELECT question_id FROM quiz_items WHERE attempt_id = $1 ORDER BY position",
    [attemptId],
  );
  return rows.map((row) => row.question_id);
}

/** Answer every item; `correctChoices` choice items get the right option, the rest a wrong one. */
async function answerAll(attempt: NonNullable<AssessmentViewResponse["attempt"]>, correctChoices: number) {
  let right = 0;
  const responses = [];
  for (const item of attempt.items) {
    let body: object;
    if (item.type === "written") body = { text: "My assessment answer." };
    else {
      body = { choice: right < correctChoices ? ASSESSMENT_CORRECT_CHOICE : 0 };
      right += 1;
    }
    const response = await post(`/api/me/quiz/${attempt.id}/items/${item.position}`, body);
    expect(response.status).toBe(200);
    responses.push(answerQuizItemResponse.parse(response.body));
  }
  return responses;
}

beforeAll(async () => {
  if (process.env.DEV_LOGIN_ENABLED !== "true")
    throw new Error("Set DEV_LOGIN_ENABLED=true in apps/api/.env");
  await fx.user("manager", "manager", "active");
  await fx.user("eng", "engineer", "active");
  const yesterday = isoFromDate(new Date(Date.now() - 86_400_000));
  await fx.insertId(
    "enrollment",
    "INSERT INTO enrollments (user_id, start_date) VALUES ($1, $2) RETURNING id",
    [fx.id("eng"), yesterday],
  );
  await content.install();

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

describe("Day-5 assessment", () => {
  it("is locked until Days 1–5 are done", async () => {
    const locked = await view();
    expect(locked).toMatchObject({
      day: 5,
      week: 1,
      weekTitle: "Test block",
      status: "locked",
      canRetake: false,
      attempt: null,
      history: [],
      unlockAll: false,
    });
    expect(locked.rules).toMatchObject({ questions: 10, choiceQuestions: 8, writtenQuestions: 2 });
    const start = await post("/api/me/assessments/5/start");
    expect(start.status).toBe(403);
    expect(errorCode(start.body)).toBe("ASSESSMENT_LOCKED");
    const outline = courseOutlineResponse.parse((await get("/api/me/course")).body);
    expect(outline.weeks.find((w) => w.number === 1)?.assessment).toEqual({ day: 5, status: "locked" });
  });

  it("rejects days without an assessment and non-engineers", async () => {
    expect((await get("/api/me/assessments/7")).status).toBe(400);
    expect((await get("/api/me/assessments/65")).status).toBe(400);
    expect((await get("/api/me/assessments/5", "manager")).status).toBe(403);
  });

  it("opens once the week is done, and Day 6 waits for it", async () => {
    await fx.owner.query(
      `INSERT INTO day_progress (enrollment_id, user_id, day, completed_at)
       SELECT $1, $2, d, now() FROM generate_series(1, 5) d`,
      [fx.id("enrollment"), fx.id("eng")],
    );
    expect((await view()).status).toBe("ready");
    const plan = myPlanResponse.parse((await get("/api/me/plan")).body);
    expect(plan.days[5]).toMatchObject({ day: 6, status: "locked", lockReason: "assessment" });
  });

  it("starts one attempt even on a double click, with 6 mcq, 2 scenario and 2 written", async () => {
    const [a, b] = await Promise.all([
      post("/api/me/assessments/5/start"),
      post("/api/me/assessments/5/start"),
    ]);
    expect(a?.status).toBe(200);
    expect(b?.status).toBe(200);
    const first = assessmentViewResponse.parse(a?.body);
    expect(assessmentViewResponse.parse(b?.body).attempt?.id).toBe(first.attempt?.id);
    expect(first.status).toBe("in_progress");
    expect(first.attempt?.number).toBe(1);
    expect(first.attempt?.items.map((item) => item.type)).toEqual([
      ...Array<string>(6).fill("mcq"),
      "scenario",
      "scenario",
      "written",
      "written",
    ]);
    expect(first.attempt?.items.every((item) => item.result === null)).toBe(true);
    expect(JSON.stringify(first)).not.toMatch(/explanation|correct"|modelAnswer|model answer/i);
    const { rows } = await fx.owner.query("SELECT 1 FROM quiz_attempts WHERE user_id = $1", [fx.id("eng")]);
    expect(rows).toHaveLength(1);
    // Resuming returns the open attempt.
    const resumed = assessmentViewResponse.parse((await post("/api/me/assessments/5/start")).body);
    expect(resumed.attempt?.id).toBe(first.attempt?.id);
  });

  it("fails at 3 of 8 and makes the engineer wait for the retake", async () => {
    const attempt = (await view()).attempt;
    if (!attempt) throw new Error("no attempt");
    const responses = await answerAll(attempt, 3);
    expect(responses.slice(0, -1).every((r) => !r.quizCompleted)).toBe(true);
    expect(responses.at(-1)).toMatchObject({ quizCompleted: true, dayCompleted: false });

    const failed = await view();
    expect(failed.status).toBe("failed");
    expect(failed.canRetake).toBe(false);
    expect(failed.attempt?.result).toMatchObject({
      choiceCorrect: 3,
      choiceTotal: 8,
      percent: 37,
      passed: false,
    });
    const retakeAt = Date.parse(failed.attempt?.result?.retakeAt ?? "");
    const completedAt = Date.parse(failed.attempt?.completedAt ?? "");
    expect(retakeAt - completedAt).toBe(failed.rules.retakeHours * 3_600_000);
    // Written answers are AI-scored in the background (a running dev worker may already have scored them).
    expect(["pending", "scored"]).toContain(
      failed.attempt?.items.find((i) => i.type === "written")?.result?.scoreStatus,
    );

    const early = await post("/api/me/assessments/5/start");
    expect(early.status).toBe(409);
    expect(errorCode(early.body)).toBe("RETAKE_NOT_YET");
    const { rows } = await fx.owner.query<{ after: unknown }>(
      "SELECT after FROM audit_log WHERE action = 'assessment.completed' AND entity_id = $1",
      [attempt.id],
    );
    expect(rows.map((row) => row.after)).toEqual([
      { day: 5, round: 1, attempt: 1, percent: 37, passed: false },
    ]);
    const plan = myPlanResponse.parse((await get("/api/me/plan")).body);
    expect(plan.days[5]).toMatchObject({ status: "locked", lockReason: "assessment" });
  });

  it("retakes after the wait with the questions not asked yet first, then passes", async () => {
    const first = (await view()).attempt;
    if (!first) throw new Error("no attempt");
    const asked = await attemptQuestions(first.id);
    await fx.owner.query("UPDATE quiz_attempts SET retake_at = now() - interval '1 minute' WHERE id = $1", [
      first.id,
    ]);
    expect((await view()).canRetake).toBe(true);

    const retake = assessmentViewResponse.parse((await post("/api/me/assessments/5/start")).body);
    expect(retake.attempt?.number).toBe(2);
    expect(retake.status).toBe("in_progress");
    expect(retake.history.map((h) => h.number)).toEqual([1]);
    const second = await attemptQuestions(retake.attempt?.id ?? "");
    const fresh = ASSESSMENT_QUESTIONS.map((q) => q.id).filter((id) => !asked.includes(id));
    expect(fresh).toHaveLength(2);
    expect(second).toEqual(expect.arrayContaining(fresh));

    if (!retake.attempt) throw new Error("no retake");
    await answerAll(retake.attempt, 8);
    const passed = await view();
    expect(passed).toMatchObject({ status: "passed", canRetake: false });
    expect(passed.attempt?.result).toMatchObject({ percent: 100, passed: true, retakeAt: null });
    expect(passed.history).toHaveLength(1);
    expect(passed.history[0]?.result.passed).toBe(false);
    // No attempt after a pass: start just returns the view.
    const again = assessmentViewResponse.parse((await post("/api/me/assessments/5/start")).body);
    expect(again.attempt?.id).toBe(retake.attempt.id);

    const plan = myPlanResponse.parse((await get("/api/me/plan")).body);
    expect(plan.days[5]?.lockReason).toBeNull();
    const outline = courseOutlineResponse.parse((await get("/api/me/course")).body);
    expect(outline.weeks.find((w) => w.number === 1)?.assessment).toEqual({ day: 5, status: "passed" });
  });
});

describe("content review (learning.unlockAll on)", () => {
  beforeAll(async () => {
    await content.setUnlockAll(true);
  });
  afterAll(async () => {
    await content.setUnlockAll(false);
  });

  it("opens an assessment before its week is done", async () => {
    const day10 = assessmentViewResponse.parse((await get("/api/me/assessments/10")).body);
    expect(day10.unlockAll).toBe(true);
    expect(day10.status).not.toBe("locked");
  });
});
