/**
 * Gate 2 end to end (real NestJS app, local Postgres): Day 40 reached → to book, Day 41 waits for the gate;
 * the recap needs the written follow-up; the manager's form lists the Phase 2 cards and Week 8's scorecard
 * pillars; recording validates the live-call plan (on a pass) and the Gate 2 bar (healthcare terms, no
 * recap-time rule); a repeat reopens 2 of Weeks 5–8; a pass opens Day 41. Uses test/content-fixtures.ts
 * (Days 1–2 and Days 36–40) with `learning.unlockAll` off.
 */
import { Test } from "@nestjs/testing";
import {
  apiErrorBody,
  courseOutlineResponse,
  CSRF_HEADER,
  engineerDetailResponse,
  gateFormResponse,
  gateListResponse,
  gateViewResponse,
  myPlanResponse,
  type SaveGateRequest,
  teamResponse,
} from "@portal/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../src/app.module.js";
import { isoFromDate } from "../../src/common/dates.js";
import { parseEnv } from "../../src/config/env.js";
import { configureHttp } from "../../src/http.js";
import { ContentFixtures, PHASE_TWO_CARD_ID } from "../content-fixtures.js";
import { Fixtures } from "../fixtures.js";
import type { NestExpressApplication } from "@nestjs/platform-express";

const env = parseEnv(process.env);
const fx = new Fixtures("g2");
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
const put = (path: string, body: object, who: string) =>
  request(app.getHttpServer())
    .put(path)
    .set("Cookie", cookies[who] ?? "")
    .set("Origin", ORIGIN)
    .set(CSRF_HEADER, "1")
    .send(body);
const errorCode = (body: unknown) => apiErrorBody.parse(body).code;
const daysAgo = (days: number) => isoFromDate(new Date(Date.now() - days * 86_400_000));

const eng = () => fx.id("eng");
const formPath = () => `/api/manager/engineers/${eng()}/gates/2`;
const RECAP =
  "Recap: Lakeside agreed to delay the HL7 feed go-live; I own the interface test plan by Friday.";
const FOLLOW_UP = {
  followUpType: "bad_news_email",
  followUpText: "Subject: HL7 feed go-live moves to 14 April. Bottom line first: the feed slips one week.",
};
const PLAN = "Shadow the Lakeside weekly status (Day 43), co-lead the Brightpath demo prep (Day 48).";

/** Good scores: average 3.17, lowest 2. */
const GOOD: SaveGateRequest = {
  heldAt: new Date(Date.now() - 3_600_000).toISOString(),
  cardId: PHASE_TWO_CARD_ID,
  surprise: "The client asks whether PHI leaves the hospital network.",
  criteria: { "1": 3, "2": 4, "3": 3, "4": 3, "8": 2, "11": 4 },
  recapOnTime: false,
  outcome: "pass",
  focusItems: [],
  repeatWeeks: [],
  rag: "green",
  note: "Calm, used the healthcare terms right.",
  overrideNote: "",
  healthcareTerms: true,
  liveCallPlan: PLAN,
};
const LOW: SaveGateRequest = {
  ...GOOD,
  criteria: { "1": 2, "2": 3, "3": 1, "4": 3 },
  outcome: "repeat",
  repeatWeeks: [6, 5],
  rag: "amber",
  note: "Questions need another pass.",
  liveCallPlan: "",
};

async function completeDays(days: number[], round = 1) {
  for (const day of days) {
    await fx.owner.query(
      `INSERT INTO day_progress (enrollment_id, user_id, day, round, completed_at)
       VALUES ($1, $2, $3::int, $4::int, now() - interval '1 hour' * (50 - $3::int))
       ON CONFLICT (enrollment_id, day, round) DO UPDATE SET completed_at = excluded.completed_at`,
      [fx.id("enr_eng"), eng(), day, round],
    );
  }
}

async function passAssessments(days: number[]) {
  for (const day of days) {
    await fx.owner.query(
      `INSERT INTO quiz_attempts (enrollment_id, user_id, kind, day, attempt, completed_at, choice_correct, choice_total, passed)
       VALUES ($1, $2, 'assessment', $3, 1, now(), 8, 8, true)`,
      [fx.id("enr_eng"), eng(), day],
    );
  }
}

beforeAll(async () => {
  if (process.env.DEV_LOGIN_ENABLED !== "true")
    throw new Error("Set DEV_LOGIN_ENABLED=true in apps/api/.env");
  await fx.user("mgr", "manager", "active");
  await fx.user("eng", "engineer", "active");
  const team = await fx.team("team");
  await fx.owner.query("INSERT INTO team_members (user_id, team_id) VALUES ($1, $2)", [eng(), team]);
  await fx.owner.query("INSERT INTO team_managers (team_id, user_id) VALUES ($1, $2)", [team, fx.id("mgr")]);
  await fx.insertId("enr_eng", "INSERT INTO enrollments (user_id, start_date) VALUES ($1, $2) RETURNING id", [
    eng(),
    daysAgo(60),
  ]);
  await content.install();
  await content.installPhaseTwo();
  await content.setUnlockAll(false);

  // Days 1–39 done, every assessment passed, check-ins held, Gate 1 passed.
  await completeDays(Array.from({ length: 39 }, (_, i) => i + 1));
  await passAssessments([5, 10, 15, 20, 25, 30, 35]);
  for (const day of [10, 30]) {
    await fx.owner.query(
      `INSERT INTO checkins (enrollment_id, user_id, manager_id, after_day, held_on, rag, note)
       VALUES ($1, $2, $3, $4, $5, 'green', 'Fine.')`,
      [fx.id("enr_eng"), eng(), fx.id("mgr"), day, daysAgo(10)],
    );
  }
  await fx.owner.query(
    `INSERT INTO gate_results (enrollment_id, user_id, gate, round, held_at, scored, average, lowest,
       recap_on_time, outcome, rag, note, manager_id)
     VALUES ($1, $2, 1, 1, now() - interval '20 days', 4, 3, 3, true, 'pass', 'green', 'Gate 1 passed.', $3)`,
    [fx.id("enr_eng"), eng(), fx.id("mgr")],
  );

  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication<NestExpressApplication>({ logger: false });
  configureHttp(app);
  await app.init();
  for (const key of ["mgr", "eng"]) cookies[key] = await signIn(key);
});

afterAll(async () => {
  await app?.close();
  await fx.cleanup();
  await content.restore();
});

describe("before Day 40", () => {
  it("Gate 2 is locked", async () => {
    const view = gateViewResponse.parse((await get("/api/me/gates/2", "eng")).body);
    expect(view).toMatchObject({ gate: 2, status: "locked", afterDay: 40, reachedAt: null });
    expect(errorCode((await put("/api/me/gates/2/recap", { text: RECAP, ...FOLLOW_UP }, "eng")).body)).toBe(
      "GATE_NOT_REACHED",
    );
    expect(errorCode((await put(formPath(), GOOD, "mgr")).body)).toBe("GATE_NOT_REACHED");
  });
});

describe("Day 40 done", () => {
  beforeAll(async () => {
    await completeDays([40]);
    await passAssessments([40]);
  });

  it("shows Gate 2 to book; Day 41 waits for the gate", async () => {
    const plan = myPlanResponse.parse((await get("/api/me/plan", "eng")).body);
    expect(plan.gates).toEqual([
      { gate: 1, afterDay: 20, status: "passed" },
      { gate: 2, afterDay: 40, status: "to_book" },
    ]);
    expect(plan.days[40]).toMatchObject({ day: 41, status: "locked", lockReason: "gate" });
    const outline = courseOutlineResponse.parse((await get("/api/me/course", "eng")).body);
    expect(outline.weeks.find((week) => week.number === 8)?.gate).toEqual({
      gate: 2,
      afterDay: 40,
      status: "to_book",
    });
    const team = teamResponse.parse((await get("/api/manager/team", "mgr")).body);
    expect(team.engineers.find((e) => e.id === eng())?.next).toBe("Gate 2 to book");
    expect(team.tasks.find((t) => t.href.endsWith("/gates/2"))).toMatchObject({
      title: `Gate 2 · eng ${fx.tag}`,
      detail: "Finished Day 40 · book 45 min",
      status: "due",
    });
    const list = gateListResponse.parse((await get("/api/manager/gates", "mgr")).body);
    expect(list.gates.map((g) => [g.gate, g.status])).toEqual([
      [1, "passed"],
      [2, "to_book"],
    ]);
  });

  it("the recap needs the written follow-up", async () => {
    const missing = await put("/api/me/gates/2/recap", { text: RECAP }, "eng");
    expect(missing.status).toBe(400);
    expect(apiErrorBody.parse(missing.body).fields).toEqual({
      followUpType: "Choose the follow-up type.",
      followUpText: "Write the follow-up.",
    });
    const noText = await put("/api/me/gates/2/recap", { text: RECAP, followUpType: "escalation" }, "eng");
    expect(apiErrorBody.parse(noText.body).fields).toEqual({ followUpText: "Write the follow-up." });
    const saved = gateViewResponse.parse(
      (await put("/api/me/gates/2/recap", { text: RECAP, ...FOLLOW_UP }, "eng")).body,
    );
    expect(saved).toMatchObject({ status: "recap_sent", recap: { text: RECAP, ...FOLLOW_UP } });
    const form = gateFormResponse.parse((await get(formPath(), "mgr")).body);
    expect(form.recap).toMatchObject(FOLLOW_UP);
  });

  it("the form lists the Phase 2 cards and the imported weeks with their scorecard pillars", async () => {
    const form = gateFormResponse.parse((await get(formPath(), "mgr")).body);
    expect(form).toMatchObject({ gate: 2, reached: true, status: "recap_sent", round: 1 });
    expect(form.cards).toContainEqual({
      id: PHASE_TWO_CARD_ID,
      title: "Test healthcare card",
      client: "Dana Brooks",
    });
    const week8 = form.weeks.find((week) => week.week === 8);
    expect(week8).toEqual({
      week: 8,
      title: "Test block 8",
      firstDay: 36,
      pillars: ["understand", "stand_firm"],
    });
    expect(form.weeks.every((week) => week.week >= 5 && week.week <= 8)).toBe(true);
  });
});

describe("recording Gate 2", () => {
  it("needs the live-call plan for a pass and checks the Gate 2 bar", async () => {
    const noPlan = await put(formPath(), { ...GOOD, liveCallPlan: "" }, "mgr");
    expect(noPlan.status).toBe(400);
    expect(apiErrorBody.parse(noPlan.body).fields).toEqual({
      liveCallPlan: "Write the Phase 3 live-call plan.",
    });
    // Healthcare terms not right → below the bar.
    expect(errorCode((await put(formPath(), { ...GOOD, healthcareTerms: false }, "mgr")).body)).toBe(
      "OVERRIDE_NOTE_REQUIRED",
    );
    // Average 3.0 is the bar; 2.5 isn't.
    expect(errorCode((await put(formPath(), { ...GOOD, criteria: { "1": 3, "2": 2 } }, "mgr")).body)).toBe(
      "OVERRIDE_NOTE_REQUIRED",
    );
    expect((await put(formPath(), { ...LOW, repeatWeeks: [4, 5] }, "mgr")).status).toBe(400);
  });

  it("records a repeat without a plan: 2 of Weeks 5–8 reopen as round 2", async () => {
    const form = gateFormResponse.parse((await put(formPath(), LOW, "mgr")).body);
    expect(form.saved?.result).toMatchObject({
      outcome: "repeat",
      repeatWeeks: [5, 6],
      healthcareTerms: true,
      liveCallPlan: null,
    });
    const plan = myPlanResponse.parse((await get("/api/me/plan", "eng")).body);
    expect(plan.gates[1]?.status).toBe("repeat");
    // Day 21 reopens in round 2 (open or not_ready, depending on whether its content is imported).
    expect(plan.days[20]).toMatchObject({ day: 21, round: 2, lockReason: null });
    expect(["open", "not_ready"]).toContain(plan.days[20]?.status);
    expect(plan.days[40]).toMatchObject({ day: 41, lockReason: "gate" });
  });

  it("records the pass (still editable: no reopened day started): Day 41 opens", async () => {
    const form = gateFormResponse.parse((await put(formPath(), GOOD, "mgr")).body);
    expect(form).toMatchObject({ status: "passed", round: 1 });
    expect(form.saved?.result).toMatchObject({
      outcome: "pass",
      average: 3.17,
      lowest: 2,
      recapOnTime: false,
      healthcareTerms: true,
      liveCallPlan: PLAN,
    });
    const plan = myPlanResponse.parse((await get("/api/me/plan", "eng")).body);
    expect(plan.gates[1]?.status).toBe("passed");
    expect(plan.days[40]).toMatchObject({ day: 41, lockReason: null });
    expect(plan.days[40]?.status).not.toBe("locked");
    const view = gateViewResponse.parse((await get("/api/me/gates/2", "eng")).body);
    expect(view.result).toMatchObject({ outcome: "pass", liveCallPlan: PLAN, healthcareTerms: true });

    const detail = engineerDetailResponse.parse((await get(`/api/manager/engineers/${eng()}`, "mgr")).body);
    expect(detail.tracker[7]).toMatchObject({ week: 8, checkpoint: "gate2", rag: "green", note: GOOD.note });
    const { rows } = await fx.owner.query<{ after: unknown }>(
      "SELECT after FROM audit_log WHERE actor_id = $1 AND action = 'gate.recorded' ORDER BY at DESC LIMIT 1",
      [fx.id("mgr")],
    );
    expect(rows[0]?.after).toMatchObject({ gate: 2, outcome: "pass", healthcareTerms: true });
    expect(JSON.stringify(rows)).not.toContain(PLAN);
  });
});
