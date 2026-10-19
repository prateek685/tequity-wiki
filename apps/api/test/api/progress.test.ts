/**
 * Progress, Journal and the Friday scorecard end to end (real NestJS app, local Postgres): the mock log
 * needs a scored criterion, the scorecard needs proof and writes a `scorecards` row with the week's
 * numbers (also shown as `weekStats` on the day), and GET /me/progress and /me/journal read them back.
 * Runs with `learning.unlockAll` on (lessons in any order, no quiz needed). Uses test/content-fixtures.ts.
 */
import { Test } from "@nestjs/testing";
import {
  apiErrorBody,
  CSRF_HEADER,
  dayViewResponse,
  journalResponse,
  progressResponse,
} from "@portal/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../src/app.module.js";
import { isoFromDate } from "../../src/common/dates.js";
import { parseEnv } from "../../src/config/env.js";
import { configureHttp } from "../../src/http.js";
import { BEHAVIOUR_IDS, ContentFixtures } from "../content-fixtures.js";
import { Fixtures } from "../fixtures.js";
import type { NestExpressApplication } from "@nestjs/platform-express";

const env = parseEnv(process.env);
const fx = new Fixtures("pg");
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
const put = (path: string, who: string, body: object = {}) =>
  request(app.getHttpServer())
    .put(path)
    .set("Cookie", cookies[who] ?? "")
    .set("Origin", ORIGIN)
    .set(CSRF_HEADER, "1")
    .send(body);

/** Baseline: U1–U4 = 1, 2, 3, 4 (understand 2.5); every other behaviour 3. */
const BASELINE = Object.fromEntries(
  BEHAVIOUR_IDS.map((id, index) => [id, id.startsWith("U") ? index + 1 : 3]),
);
const DAY_ONE = { understand: 2.5, communicate: 3, own: 3, stand_firm: 3 };

beforeAll(async () => {
  if (process.env.DEV_LOGIN_ENABLED !== "true")
    throw new Error("Set DEV_LOGIN_ENABLED=true in apps/api/.env");
  await fx.user("manager", "manager", "active");
  await fx.user("eng", "engineer", "active");
  const team = await fx.team("team");
  await fx.owner.query("INSERT INTO team_members (user_id, team_id) VALUES ($1, $2)", [fx.id("eng"), team]);
  await fx.owner.query("INSERT INTO team_managers (team_id, user_id) VALUES ($1, $2)", [
    team,
    fx.id("manager"),
  ]);
  const yesterday = isoFromDate(new Date(Date.now() - 86_400_000));
  await fx.insertId("enr", "INSERT INTO enrollments (user_id, start_date) VALUES ($1, $2) RETURNING id", [
    fx.id("eng"),
    yesterday,
  ]);
  await content.install();
  await content.setUnlockAll(true);

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

describe("progress before anything is saved", () => {
  it("has the days, no scores and an empty rubric", async () => {
    const response = await get("/api/me/progress", "eng");
    expect(response.status).toBe(200);
    const progress = progressResponse.parse(response.body);
    expect(progress.days).toMatchObject({ done: 0, total: 65 });
    expect(progress.days.pace).not.toBeNull();
    expect(progress.days.targetDate).not.toBeNull();
    expect(progress).toMatchObject({
      assessments: { passed: 0, taken: 0, averagePercent: null },
      gate1: null,
      writing: null,
      scorecards: [],
      dayOne: null,
      now: { understand: null, communicate: null, own: null, stand_firm: null },
    });
    expect(progress.rubric).toHaveLength(11);
    expect(progress.rubric.every((row) => row.average === null && row.count === 0)).toBe(true);
    expect((await get("/api/me/journal", "eng")).body).toEqual({ entries: [] });
  });
});

describe("mock log and scorecard", () => {
  it("needs at least one rubric criterion scored on the mock log", async () => {
    await put("/api/me/days/1/lessons/meet", "eng");
    await put("/api/me/days/1/lessons/call", "eng");
    const values = { "went-well": "Clear opening.", "fix-next": "Slow down." };
    const empty = await put("/api/me/days/1/lessons/after-call", "eng", {
      values,
      rubric: { "1": null, "2": null },
    });
    expect(empty.status).toBe(400);
    expect(apiErrorBody.parse(empty.body).fields).toEqual({
      rubric: "Score the call on at least one criterion.",
    });
    const ok = await put("/api/me/days/1/lessons/after-call", "eng", {
      values,
      rubric: { "1": 4, "2": null, "3": 2 },
    });
    expect(ok.status).toBe(200);
    expect((await put("/api/me/days/1/lessons/baseline", "eng", { ratings: BASELINE })).status).toBe(200);
    const day1 = dayViewResponse.parse((await get("/api/me/days/1", "eng")).body);
    expect(day1.weekStats).toBeNull();
    expect(day1.model.rubric[0]?.anchors).toEqual({
      one: "Needs work.",
      three: "Solid.",
      five: "Excellent.",
    });
  });

  it("shows the week's numbers on the scorecard day", async () => {
    await put("/api/me/days/2/lessons/look-back", "eng");
    await put("/api/me/days/2/lessons/rewrite", "eng", { values: { answer: "Yes, Friday." } });
    const day2 = dayViewResponse.parse((await get("/api/me/days/2", "eng")).body);
    // Day 1's quiz isn't done; Day 2 counts once its lessons before the scorecard are done. One mock saved.
    expect(day2.weekStats).toEqual({ daysCompleted: 1, mocksDone: 1 });
  });

  it("needs proof for each rated pillar, then saves the week's scorecard row", async () => {
    const noProof = await put("/api/me/days/2/lessons/friday", "eng", { ratings: { C1: 3, C4: 4 } });
    expect(noProof.status).toBe(400);
    expect(apiErrorBody.parse(noProof.body).fields).toEqual({
      "values.proof-communicate": "Write one or two lines of proof.",
    });
    const values = { "proof-communicate": "Opened the sync with the answer.", win: "Clear demo.", stuck: "" };
    expect(
      (await put("/api/me/days/2/lessons/friday", "eng", { ratings: { C1: 3, C4: 4 }, values })).status,
    ).toBe(200);
    // Saving again updates the same row.
    expect(
      (await put("/api/me/days/2/lessons/friday", "eng", { ratings: { C1: 5, C4: 4 }, values })).status,
    ).toBe(200);
    const { rows } = await fx.owner.query(
      `SELECT week, day, ratings, pillar_scores, proof, win, stuck, days_completed, mocks_done
       FROM scorecards WHERE user_id = $1`,
      [fx.id("eng")],
    );
    expect(rows).toEqual([
      {
        week: 1,
        day: 2,
        ratings: { C1: 5, C4: 4 },
        pillar_scores: { communicate: 4.5 },
        proof: { communicate: "Opened the sync with the answer." },
        win: "Clear demo.",
        stuck: null,
        days_completed: 1,
        mocks_done: 1,
      },
    ]);
  });
});

describe("progress", () => {
  beforeAll(async () => {
    const eng = fx.id("eng");
    const enr = fx.id("enr");
    // Week 2 rates only Understand.
    await fx.owner.query(
      `INSERT INTO scorecards (enrollment_id, user_id, week, day, ratings, pillar_scores, proof, days_completed, mocks_done)
       VALUES ($1, $2, 2, 10, '{"U1": 4}', '{"understand": 4}', '{"understand": "Asked why."}', 5, 2)`,
      [enr, eng],
    );
    // Day 5: failed 50%, then passed 75%. Day 10: passed 62%. Average of the best = floor(68.5) = 68.
    for (const [day, attempt, correct, passed] of [
      [5, 1, 4, false],
      [5, 2, 6, true],
      [10, 1, 5, true],
    ] as const) {
      await fx.owner.query(
        `INSERT INTO quiz_attempts (enrollment_id, user_id, kind, day, attempt, completed_at, choice_correct, choice_total, passed)
         VALUES ($1, $2, 'assessment', $3, $4, now(), $5, 8, $6)`,
        [enr, eng, day, attempt, correct, passed],
      );
    }
  });

  it("returns scorecards with carry-forward, the Day-1 baseline, now, assessments and the rubric", async () => {
    const progress = progressResponse.parse((await get("/api/me/progress", "eng")).body);
    expect(progress.dayOne).toEqual(DAY_ONE);
    expect(progress.scorecards).toEqual([
      {
        week: 1,
        day: 2,
        scores: { ...DAY_ONE, communicate: 4.5 },
        rated: ["communicate"],
        daysCompleted: 1,
        mocksDone: 1,
      },
      {
        week: 2,
        day: 10,
        scores: { ...DAY_ONE, communicate: 4.5, understand: 4 },
        rated: ["understand"],
        daysCompleted: 5,
        mocksDone: 2,
      },
    ]);
    expect(progress.now).toEqual({ ...DAY_ONE, communicate: 4.5, understand: 4 });
    expect(progress.assessments).toEqual({ passed: 2, taken: 2, averagePercent: 68 });
    expect(progress.rubric.slice(0, 3)).toEqual([
      { criterion: 1, average: 4, count: 1 },
      { criterion: 2, average: null, count: 0 },
      { criterion: 3, average: 2, count: 1 },
    ]);
    expect(progress.rubric[10]).toEqual({ criterion: 11, average: null, count: 0 });
  });
});

describe("journal", () => {
  it("lists every saved text with its label, newest day first, lessons in order", async () => {
    const journal = journalResponse.parse((await get("/api/me/journal", "eng")).body);
    expect(journal.entries.map((e) => [e.day, e.lessonId, e.label, e.text])).toEqual([
      [2, "rewrite", "answer", "Yes, Friday."],
      [2, "friday", "Proof: communicate", "Opened the sync with the answer."],
      [2, "friday", "Biggest win", "Clear demo."],
      [1, "after-call", "went-well", "Clear opening."],
      [1, "after-call", "fix-next", "Slow down."],
    ]);
    expect(journal.entries[0]).toMatchObject({ storyDate: "Tuesday, March 3", lessonTitle: "Rewrite" });
  });

  it("is the engineer's own: a manager can't open progress or the journal", async () => {
    expect((await get("/api/me/journal", "manager")).status).toBe(403);
    expect((await get("/api/me/progress", "manager")).status).toBe(403);
  });
});
