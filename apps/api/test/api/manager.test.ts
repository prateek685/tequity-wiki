/**
 * Manager v1 end to end (real NestJS app, local Postgres): the Team page, engineer detail, unlock with a
 * reason and check-ins, plus what the engineer sees of them (plan check-ins). The engineer's progress is written with the owner connection; every
 * request runs through the API as the signed-in user. Uses test/content-fixtures.ts (Days 1–2, the
 * Day-5 pool) with `learning.unlockAll` off; Day 11 and the Day-10 pool come from the imported course.
 */
import { Test } from "@nestjs/testing";
import {
  apiErrorBody,
  assessmentViewResponse,
  checkinFormResponse,
  checkinPrepResponse,
  CSRF_HEADER,
  engineerDetailResponse,
  myPlanResponse,
  teamResponse,
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
const fx = new Fixtures("mg");
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

const get = (path: string, who = "mgr") =>
  request(app.getHttpServer())
    .get(path)
    .set("Cookie", cookies[who] ?? "");
const send = (method: "post" | "put", path: string, body: object, who = "mgr") => {
  const agent = request(app.getHttpServer());
  return (method === "post" ? agent.post(path) : agent.put(path))
    .set("Cookie", cookies[who] ?? "")
    .set("Origin", ORIGIN)
    .set(CSRF_HEADER, "1")
    .send(body);
};
const errorCode = (body: unknown) => apiErrorBody.parse(body).code;

const daysAgo = (days: number) => isoFromDate(new Date(Date.now() - days * 86_400_000));

beforeAll(async () => {
  if (process.env.DEV_LOGIN_ENABLED !== "true")
    throw new Error("Set DEV_LOGIN_ENABLED=true in apps/api/.env");
  await fx.user("mgr", "manager", "active");
  await fx.user("other", "manager", "active");
  await fx.user("admin", "admin", "active");
  await fx.user("eng", "engineer", "active");
  await fx.user("later", "engineer", "active");
  await fx.user("far", "engineer", "active");
  const team = await fx.team("team");
  const otherTeam = await fx.team("otherteam");
  await fx.owner.query("INSERT INTO team_members (user_id, team_id) VALUES ($1, $4), ($2, $4), ($3, $5)", [
    fx.id("eng"),
    fx.id("later"),
    fx.id("far"),
    team,
    otherTeam,
  ]);
  await fx.owner.query("INSERT INTO team_managers (team_id, user_id) VALUES ($1, $2), ($3, $4)", [
    team,
    fx.id("mgr"),
    otherTeam,
    fx.id("other"),
  ]);
  const enrol = (key: string, start: string) =>
    fx.insertId(`enr_${key}`, "INSERT INTO enrollments (user_id, start_date) VALUES ($1, $2) RETURNING id", [
      fx.id(key),
      start,
    ]);
  await enrol("eng", daysAgo(20));
  await enrol("later", daysAgo(-10));
  await enrol("far", daysAgo(5));
  await content.install();
  await content.setUnlockAll(false);

  const eng = fx.id("eng");
  const enr = fx.id("enr_eng");
  // Days 1–10 done; Day 10 ten days ago (its check-in is 3 days overdue).
  for (let day = 1; day <= 10; day++) {
    await fx.owner.query(
      `INSERT INTO day_progress (enrollment_id, user_id, day, completed_at)
       VALUES ($1, $2, $3, now() - (25 - $3) * interval '1 day' + interval '5 days' * ($3 = 10)::int)`,
      [enr, eng, day],
    );
  }
  // Day-1 baseline: every behaviour 3.
  await fx.owner.query(
    `INSERT INTO step_entries (enrollment_id, user_id, day, lesson_id, entry) VALUES ($1, $2, 1, 'baseline', $3)`,
    [enr, eng, JSON.stringify({ ratings: Object.fromEntries(BEHAVIOUR_IDS.map((id) => [id, 3])) })],
  );
  await fx.owner.query(
    `INSERT INTO scorecards (enrollment_id, user_id, week, day, ratings, pillar_scores, proof, days_completed, mocks_done)
     VALUES ($1, $2, 1, 5, '{"U1": 4}', '{"understand": 4}', '{"understand": "Asked why."}', 5, 2),
            ($1, $2, 2, 10, '{"C1": 2}', '{"communicate": 2}', '{"communicate": "Rambled."}', 5, 2)`,
    [enr, eng],
  );
  // Week 1 passed; Week 2 failed an hour ago, retake in 23 hours.
  await fx.owner.query(
    `INSERT INTO quiz_attempts (enrollment_id, user_id, kind, day, attempt, started_at, completed_at, choice_correct, choice_total, passed)
     VALUES ($1, $2, 'assessment', 5, 1, now() - interval '12 days', now() - interval '12 days', 8, 8, true)`,
    [enr, eng],
  );
  await fx.insertId(
    "week2",
    `INSERT INTO quiz_attempts (enrollment_id, user_id, kind, day, attempt, started_at, completed_at, choice_correct, choice_total, passed, retake_at)
     VALUES ($1, $2, 'assessment', 10, 1, now() - interval '2 hours', now() - interval '1 hour', 1, 8, false, now() + interval '23 hours')
     RETURNING id`,
    [enr, eng],
  );

  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication<NestExpressApplication>({ logger: false });
  configureHttp(app);
  await app.init();
  for (const key of ["mgr", "other", "admin", "eng"]) cookies[key] = await signIn(key);
});

afterAll(async () => {
  await app?.close();
  await fx.cleanup();
  await content.restore();
});

describe("team", () => {
  it("lists the engineers on the manager's teams with progress, the next checkpoint and the unlock", async () => {
    const response = await get("/api/manager/team");
    expect(response.status).toBe(200);
    const team = teamResponse.parse(response.body);
    expect(team.engineers.map((e) => e.id).sort()).toEqual([fx.id("eng"), fx.id("later")].sort());
    const eng = team.engineers.find((e) => e.id === fx.id("eng"));
    expect(eng).toMatchObject({
      name: `eng ${fx.tag}`,
      teamName: `team ${fx.tag}`,
      daysDone: 10,
      currentDay: null,
      pillars: { understand: 4, communicate: 2, own: 3, stand_firm: 3 },
      rag: null,
      next: "Week 2 assessment retake",
      unlock: { kind: "retake_now", day: 10, label: "Allow the Week 2 assessment retake now" },
    });
    const later = team.engineers.find((e) => e.id === fx.id("later"));
    expect(later).toMatchObject({ daysDone: 0, unlock: null, pace: { status: "not_started" } });
    expect(team.kpis).toMatchObject({ engineers: 2, checkinsDue: 1 });
    expect(team.kpis.averagePace).toBe(eng?.pace?.difference);
    expect(team.tasks).toEqual([
      {
        engineer: { id: fx.id("eng"), name: `eng ${fx.tag}` },
        title: `Check-in · eng ${fx.tag}`,
        detail: "After Day 10 · overdue 3 days",
        status: "overdue",
        href: `/manager/engineers/${fx.id("eng")}/checkins/10`,
      },
    ]);
  });

  it("is for managers only, and another team's manager sees only their own team", async () => {
    expect((await get("/api/manager/team", "eng")).status).toBe(403);
    expect((await get("/api/manager/team", "admin")).status).toBe(403);
    const other = teamResponse.parse((await get("/api/manager/team", "other")).body);
    expect(other.engineers.map((e) => e.id)).toEqual([fx.id("far")]);
    expect(other.tasks).toEqual([]);
  });
});

describe("engineer detail", () => {
  it("has the progress page numbers, the tracker, check-ins due and the unlock option", async () => {
    const response = await get(`/api/manager/engineers/${fx.id("eng")}`);
    expect(response.status).toBe(200);
    const detail = engineerDetailResponse.parse(response.body);
    expect(detail.engineer).toMatchObject({ id: fx.id("eng"), teamName: `team ${fx.tag}` });
    expect(detail.progress.days.done).toBe(10);
    // The Day-1 baseline comes through the numbers-only function (managers can't read lesson entries).
    expect(detail.progress.dayOne).toEqual({ understand: 3, communicate: 3, own: 3, stand_firm: 3 });
    expect(detail.progress.scorecards.map((card) => card.week)).toEqual([1, 2]);
    expect(detail.progress.assessments).toEqual({ passed: 1, taken: 2, averagePercent: 56 });
    expect(detail.tracker).toHaveLength(13);
    expect(detail.tracker[1]).toMatchObject({ week: 2, daysDone: 5, checkpoint: "checkin", rag: null });
    expect(detail.tracker[1]?.pillars).toMatchObject({ communicate: 2 });
    expect(detail.checkinsDue).toEqual([10]);
    expect(detail.checkins).toEqual([]);
    expect(detail.unlocks).toEqual([]);
    expect(detail.unlock?.kind).toBe("retake_now");
  });

  it("is not found for an engineer the manager doesn't manage, or an unknown id", async () => {
    expect(errorCode((await get(`/api/manager/engineers/${fx.id("eng")}`, "other")).body)).toBe("NOT_FOUND");
    expect((await get(`/api/manager/engineers/${fx.id("far")}`)).status).toBe(404);
    expect((await get(`/api/manager/engineers/${fx.id("mgr")}`)).status).toBe(404);
    expect((await get("/api/manager/engineers/not-a-uuid")).status).toBe(400);
    expect((await get(`/api/manager/engineers/${fx.id("eng")}`, "eng")).status).toBe(403);
  });
});

describe("check-ins", () => {
  const path = (day: number) => `/api/manager/engineers/${fx.id("eng")}/checkins/${day}`;
  const body = {
    heldOn: daysAgo(1),
    rag: "amber",
    note: "Slow on bad news.",
  };

  it("opens the form with the last two scorecards; not reached yet for Day 30", async () => {
    const form = checkinFormResponse.parse((await get(path(10))).body);
    expect(form).toMatchObject({ afterDay: 10, week: 2, reached: true, checkin: null });
    expect(form.scorecards.map((card) => card.week)).toEqual([1, 2]);
    const later = checkinFormResponse.parse((await get(path(30))).body);
    expect(later.reached).toBe(false);
    expect((await get(path(20))).status).toBe(400);
  });

  it("can't be saved before the day is reached, or without a note", async () => {
    expect(errorCode((await send("put", path(30), body)).body)).toBe("CHECKIN_NOT_REACHED");
    const noNote = await send("put", path(10), { ...body, note: " " });
    expect(noNote.status).toBe(400);
    expect(apiErrorBody.parse(noNote.body).fields).toEqual({ note: "Add a one-line note." });
  });

  it("lets the engineer write notes the manager reads", async () => {
    const mine = (day: number) => `/api/me/checkins/${day}`;
    const notes = {
      spotCheck: "Asked for a recap; clear.",
      stuck: "Bad-news emails.",
      support: "Pair on Day 12.",
    };
    expect(errorCode((await send("put", mine(30), notes, "eng")).body)).toBe("CHECKIN_NOT_REACHED");
    expect((await send("put", mine(20), notes, "eng")).status).toBe(400);
    const empty = checkinPrepResponse.parse((await get(mine(10), "eng")).body);
    expect(empty).toEqual({ afterDay: 10, reached: true, locked: false, prep: null });
    const saved = await send("put", mine(10), notes, "eng");
    expect(saved.status).toBe(200);
    expect(checkinPrepResponse.parse(saved.body).prep).toMatchObject(notes);
    const again = await send("put", mine(10), { ...notes, stuck: "Dates." }, "eng");
    expect(checkinPrepResponse.parse(again.body).prep?.stuck).toBe("Dates.");
    const form = checkinFormResponse.parse((await get(path(10))).body);
    expect(form.prep).toMatchObject({ ...notes, stuck: "Dates." });
    // Managers can't write the engineer's notes, and the engineer's endpoint is engineer-only.
    expect((await send("put", mine(10), notes)).status).toBe(403);
  });

  it("records the check-in, then updates the same one", async () => {
    const saved = await send("put", path(10), body);
    expect(saved.status).toBe(200);
    expect(checkinFormResponse.parse(saved.body).checkin).toMatchObject({
      afterDay: 10,
      week: 2,
      rag: "amber",
      note: "Slow on bad news.",
      by: { id: fx.id("mgr"), name: `mgr ${fx.tag}` },
    });
    const updated = checkinFormResponse.parse((await send("put", path(10), { ...body, rag: "green" })).body);
    expect(updated.checkin?.rag).toBe("green");
    const { rows } = await fx.owner.query("SELECT rag FROM checkins WHERE user_id = $1", [fx.id("eng")]);
    expect(rows).toEqual([{ rag: "green" }]);
    expect((await send("put", path(10), body, "other")).status).toBe(404);
  });

  it("locks the engineer's notes once the check-in is recorded", async () => {
    const locked = await send("put", `/api/me/checkins/10`, { stuck: "Changed my mind." }, "eng");
    expect(errorCode(locked.body)).toBe("CHECKIN_LOCKED");
    const view = checkinPrepResponse.parse((await get("/api/me/checkins/10", "eng")).body);
    expect(view).toMatchObject({ locked: true, prep: { stuck: "Dates." } });
  });

  it("shows on the Team page, the tracker and the engineer's plan", async () => {
    const team = teamResponse.parse((await get("/api/manager/team")).body);
    expect(team.engineers.find((e) => e.id === fx.id("eng"))?.rag).toBe("green");
    expect(team.tasks).toEqual([]);
    expect(team.kpis.checkinsDue).toBe(0);
    const detail = engineerDetailResponse.parse((await get(`/api/manager/engineers/${fx.id("eng")}`)).body);
    expect(detail.tracker[1]).toMatchObject({ rag: "green", note: "Slow on bad news." });
    expect(detail.checkinsDue).toEqual([]);
    const plan = myPlanResponse.parse((await get("/api/me/plan", "eng")).body);
    expect(plan.checkins).toEqual([
      {
        afterDay: 10,
        heldOn: body.heldOn,
        rag: "green",
        note: "Slow on bad news.",
      },
    ]);
  });
});

describe("unlock", () => {
  const path = () => `/api/manager/engineers/${fx.id("eng")}/unlock`;

  it("refuses a request that doesn't match the current option", async () => {
    const stale = await send("post", path(), { kind: "next_day", day: 11, reason: "Back from leave." });
    expect(stale.status).toBe(409);
    expect(errorCode(stale.body)).toBe("NOTHING_TO_UNLOCK");
    expect((await send("post", path(), { kind: "retake_now", day: 10, reason: "x" })).status).toBe(400);
  });

  it("allows the retake now: the engineer can start it at once", async () => {
    const before = assessmentViewResponse.parse((await get("/api/me/assessments/10", "eng")).body);
    expect(before.canRetake).toBe(false);
    const response = await send("post", path(), {
      kind: "retake_now",
      day: 10,
      reason: "Exam stress, retry.",
    });
    expect(response.status).toBe(200);
    const detail = engineerDetailResponse.parse(response.body);
    expect(detail.unlocks).toEqual([
      expect.objectContaining({
        kind: "retake_now",
        day: 10,
        by: { id: fx.id("mgr"), name: `mgr ${fx.tag}` },
      }),
    ]);
    // The retake is open now, so the next option is Day 11 (still locked by the assessment).
    expect(detail.unlock).toEqual({ kind: "next_day", day: 11, label: "Open Day 11" });
    const after = assessmentViewResponse.parse((await get("/api/me/assessments/10", "eng")).body);
    expect(after.canRetake).toBe(true);
    expect(new Date(after.attempt?.result?.retakeAt ?? "").getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("opens the next day despite its lock, everywhere the engineer looks", async () => {
    const before = myPlanResponse.parse((await get("/api/me/plan", "eng")).body);
    expect(before.days[10]).toMatchObject({ day: 11, status: "locked", lockReason: "assessment" });
    const response = await send("post", path(), {
      kind: "next_day",
      day: 11,
      reason: "Retake booked for Friday.",
    });
    expect(response.status).toBe(200);
    const plan = myPlanResponse.parse((await get("/api/me/plan", "eng")).body);
    expect(plan.days[10]).toMatchObject({ day: 11, status: "open", lockReason: null });
    expect(plan.currentDay).toBe(11);
    expect((await get("/api/me/days/11", "eng")).status).toBe(200);
    const { rows } = await fx.owner.query(
      "SELECT after FROM audit_log WHERE actor_id = $1 AND action = 'unlock.granted' ORDER BY at",
      [fx.id("mgr")],
    );
    expect(rows.map((row: { after: { kind: string } }) => row.after.kind)).toEqual([
      "retake_now",
      "next_day",
    ]);
  });

  it("is for the engineer's own managers only", async () => {
    const response = await send(
      "post",
      path(),
      { kind: "next_day", day: 12, reason: "Not my team." },
      "other",
    );
    expect(response.status).toBe(404);
    expect(
      (await send("post", path(), { kind: "next_day", day: 12, reason: "Self-serve." }, "eng")).status,
    ).toBe(403);
  });
});
