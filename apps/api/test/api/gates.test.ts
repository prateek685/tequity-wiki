/**
 * Gate 1 and repeat blocks end to end (real NestJS app, local Postgres): the engineer's Gate page and
 * recap, My plan / the outline, the manager's gate list, form and save (validation, override note,
 * repeat → Weeks 2–3 reopen as round 2 with round 1 kept, edit until the repeat starts, rerun → pass →
 * Day 21 opens), the Team page tasks, the tracker and Progress. Progress rows are written with the owner
 * connection; every request goes through the API as the signed-in user. Uses test/content-fixtures.ts
 * (Days 1–2) with `learning.unlockAll` off; Days 3–20 come from the imported course.
 */
import { Test } from "@nestjs/testing";
import {
  apiErrorBody,
  courseOutlineResponse,
  CSRF_HEADER,
  dayViewResponse,
  engineerDetailResponse,
  gateFormResponse,
  gateListResponse,
  gateViewResponse,
  myPlanResponse,
  progressResponse,
  type SaveGateRequest,
  teamResponse,
} from "@portal/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../src/app.module.js";
import { isoFromDate } from "../../src/common/dates.js";
import { parseEnv } from "../../src/config/env.js";
import { configureHttp } from "../../src/http.js";
import { ContentFixtures } from "../content-fixtures.js";
import { Fixtures } from "../fixtures.js";
import type { NestExpressApplication } from "@nestjs/platform-express";

const env = parseEnv(process.env);
const fx = new Fixtures("gt");
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
const formPath = (key = "eng") => `/api/manager/engineers/${fx.id(key)}/gates/1`;
const RECAP = "Recap: Dana agreed the Epic go-live moves a week; I own the vendor follow-up by Friday.";

/** Below the bar: average 2.2, one criterion at 1. Week pillars decide the suggestion. */
const LOW: SaveGateRequest = {
  heldAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  cardId: "S12",
  surprise: "The vendor delays access by two weeks.",
  criteria: { "1": 3, "2": 1, "3": 2, "4": 2, "6": 3, "7": null, "11": 2 },
  recapOnTime: true,
  outcome: "repeat",
  focusItems: [],
  repeatWeeks: [2, 3],
  rag: "amber",
  note: "Answer-first and questions need another pass.",
  overrideNote: "",
  healthcareTerms: false,
  liveCallPlan: "",
};
const GOOD: SaveGateRequest = {
  ...LOW,
  criteria: { "1": 3, "2": 3, "3": 3, "4": 3, "5": 2, "11": 4 },
  outcome: "pass",
  repeatWeeks: [],
  rag: "green",
  note: "Clear, calm, recap on time.",
};

async function completeDays(days: number[], round: number) {
  for (const day of days) {
    await fx.owner.query(
      `INSERT INTO day_progress (enrollment_id, user_id, day, round, completed_at)
       VALUES ($1, $2, $3::int, $4::int, now() - interval '1 day' * (30 - $3::int) / $4::int)
       ON CONFLICT (enrollment_id, day, round) DO UPDATE SET completed_at = excluded.completed_at`,
      [fx.id("enr_eng"), eng(), day, round],
    );
  }
}

async function passAssessments(days: number[], round: number) {
  for (const day of days) {
    await fx.owner.query(
      `INSERT INTO quiz_attempts (enrollment_id, user_id, kind, day, round, attempt, completed_at, choice_correct, choice_total, passed)
       VALUES ($1, $2, 'assessment', $3, $4, 1, now(), 8, 8, true)`,
      [fx.id("enr_eng"), eng(), day, round],
    );
  }
}

beforeAll(async () => {
  if (process.env.DEV_LOGIN_ENABLED !== "true")
    throw new Error("Set DEV_LOGIN_ENABLED=true in apps/api/.env");
  await fx.user("mgr", "manager", "active");
  await fx.user("other", "manager", "active");
  await fx.user("eng", "engineer", "active");
  await fx.user("early", "engineer", "active");
  const team = await fx.team("team");
  const otherTeam = await fx.team("otherteam");
  await fx.owner.query("INSERT INTO team_members (user_id, team_id) VALUES ($1, $3), ($2, $3)", [
    eng(),
    fx.id("early"),
    team,
  ]);
  await fx.owner.query("INSERT INTO team_managers (team_id, user_id) VALUES ($1, $2), ($3, $4)", [
    team,
    fx.id("mgr"),
    otherTeam,
    fx.id("other"),
  ]);
  for (const key of ["eng", "early"]) {
    await fx.insertId(
      `enr_${key}`,
      "INSERT INTO enrollments (user_id, start_date) VALUES ($1, $2) RETURNING id",
      [fx.id(key), daysAgo(30)],
    );
  }
  await content.install();
  await content.setUnlockAll(false);

  // eng: Days 1–19 done; a round-1 Day-6 lesson entry that must survive the repeat.
  await completeDays(
    Array.from({ length: 19 }, (_, i) => i + 1),
    1,
  );
  await passAssessments([5, 10, 15], 1);
  await fx.owner.query(
    `INSERT INTO step_entries (enrollment_id, user_id, day, lesson_id, entry) VALUES ($1, $2, 6, 'round-one-note', $3)`,
    [fx.id("enr_eng"), eng(), JSON.stringify({ values: { note: "Round 1 text." } })],
  );
  // A check-in after Day 10 already happened (so it doesn't take the "next" slot).
  await fx.owner.query(
    `INSERT INTO checkins (enrollment_id, user_id, manager_id, after_day, held_on, rag, note)
     VALUES ($1, $2, $3, 10, $4, 'green', 'Fine.')`,
    [fx.id("enr_eng"), eng(), fx.id("mgr"), daysAgo(15)],
  );

  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication<NestExpressApplication>({ logger: false });
  configureHttp(app);
  await app.init();
  for (const key of ["mgr", "other", "eng"]) cookies[key] = await signIn(key);
});

afterAll(async () => {
  await app?.close();
  await fx.cleanup();
  await content.restore();
});

describe("before Day 20", () => {
  it("the gate is locked and the recap can't be sent", async () => {
    const view = gateViewResponse.parse((await get("/api/me/gates/1", "eng")).body);
    expect(view).toMatchObject({
      gate: 1,
      status: "locked",
      round: 1,
      afterDay: 20,
      reachedAt: null,
      result: null,
    });
    const recap = await put("/api/me/gates/1/recap", { text: RECAP }, "eng");
    expect(recap.status).toBe(422);
    expect(errorCode(recap.body)).toBe("GATE_NOT_REACHED");
    const gate2 = gateViewResponse.parse((await get("/api/me/gates/2", "eng")).body);
    expect(gate2).toMatchObject({ gate: 2, status: "locked", afterDay: 40 });
    expect((await get("/api/me/gates/3", "eng")).status).toBe(400);
  });

  it("the manager can't record it yet, and the list leaves the engineer out", async () => {
    const save = await put(formPath(), GOOD, "mgr");
    expect(errorCode(save.body)).toBe("GATE_NOT_REACHED");
    const form = gateFormResponse.parse((await get(formPath(), "mgr")).body);
    expect(form).toMatchObject({ reached: false, status: "locked", saved: null });
    expect(gateListResponse.parse((await get("/api/manager/gates", "mgr")).body).gates).toEqual([]);
  });
});

describe("Day 20 done", () => {
  beforeAll(async () => {
    await completeDays([20], 1);
    await passAssessments([20], 1);
  });

  it("shows Gate 1 to book on the plan, the outline and the Gate page; Day 21 waits for the gate", async () => {
    const plan = myPlanResponse.parse((await get("/api/me/plan", "eng")).body);
    expect(plan.gates).toEqual([
      { gate: 1, afterDay: 20, status: "to_book" },
      { gate: 2, afterDay: 40, status: "locked" },
    ]);
    expect(plan.days[20]).toMatchObject({ day: 21, status: "locked", lockReason: "gate", round: 1 });
    const outline = courseOutlineResponse.parse((await get("/api/me/course", "eng")).body);
    expect(outline.weeks[3]?.gate).toEqual({ gate: 1, afterDay: 20, status: "to_book" });
    expect(outline.weeks[0]?.gate).toBeNull();
    const view = gateViewResponse.parse((await get("/api/me/gates/1", "eng")).body);
    expect(view.status).toBe("to_book");
    expect(view.reachedAt).not.toBeNull();
  });

  it("the manager sees a task to book it, the next checkpoint and the list row", async () => {
    const team = teamResponse.parse((await get("/api/manager/team", "mgr")).body);
    expect(team.engineers.find((e) => e.id === eng())?.next).toBe("Gate 1 to book");
    expect(team.tasks).toContainEqual({
      engineer: { id: eng(), name: `eng ${fx.tag}` },
      title: `Gate 1 · eng ${fx.tag}`,
      detail: "Finished Day 20 · book 45 min",
      // Day 20 was finished 10 days ago: 3 days past the 7-day window.
      status: "overdue",
      href: `/manager/engineers/${eng()}/gates/1`,
    });
    const list = gateListResponse.parse((await get("/api/manager/gates", "mgr")).body);
    expect(list.gates).toEqual([
      expect.objectContaining({
        engineer: { id: eng(), name: `eng ${fx.tag}` },
        round: 1,
        status: "to_book",
        recapAt: null,
        result: null,
      }),
    ]);
  });

  it("the form lists the Phase 1 cards and Weeks 1–4 with their scorecard pillars", async () => {
    const form = gateFormResponse.parse((await get(formPath(), "mgr")).body);
    expect(form).toMatchObject({
      reached: true,
      status: "to_book",
      round: 1,
      recap: null,
      saved: null,
      history: [],
    });
    const ids = form.cards.map((card) => card.id);
    for (const id of ["S01", "S12", "S33", "S36"]) expect(ids).toContain(id);
    expect(form.cards.find((card) => card.id === "S12")?.client).toBe("Dana Brooks");
    expect(form.weeks.map((w) => [w.week, w.firstDay])).toEqual([
      [1, 1],
      [2, 6],
      [3, 11],
      [4, 16],
    ]);
    // Day 5's scorecard rates C1 and C4 (the fixture plan maps C* to communicate).
    expect(form.weeks[0]?.pillars).toEqual(["communicate", "communicate"]);
    expect(form.weeks[3]?.pillars.length).toBeGreaterThan(0);
  });

  it("the engineer sends the recap and can edit it; the first submit time stays", async () => {
    const first = gateViewResponse.parse((await put("/api/me/gates/1/recap", { text: RECAP }, "eng")).body);
    expect(first).toMatchObject({ status: "recap_sent", recap: { text: RECAP } });
    const edited = gateViewResponse.parse(
      (await put("/api/me/gates/1/recap", { text: `${RECAP} Edited.` }, "eng")).body,
    );
    expect(edited.recap).toEqual({
      text: `${RECAP} Edited.`,
      submittedAt: first.recap?.submittedAt,
      followUpType: null,
      followUpText: null,
    });
    expect((await put("/api/me/gates/1/recap", { text: "Too short." }, "eng")).status).toBe(400);
    const team = teamResponse.parse((await get("/api/manager/team", "mgr")).body);
    expect(team.tasks.find((t) => t.href.endsWith("/gates/1"))?.detail).toBe(
      "Recap received · record the result",
    );
    expect(team.engineers.find((e) => e.id === eng())?.next).toBe("Gate 1 to record");
    const form = gateFormResponse.parse((await get(formPath(), "mgr")).body);
    expect(form.recap?.text).toBe(`${RECAP} Edited.`);
  });
});

describe("recording", () => {
  it("validates the outcome against the bar, the repeat weeks and focus items", async () => {
    const pass = await put(formPath(), { ...LOW, outcome: "pass", repeatWeeks: [] }, "mgr");
    expect(pass.status).toBe(422);
    expect(errorCode(pass.body)).toBe("OVERRIDE_NOTE_REQUIRED");
    expect(
      errorCode((await put(formPath(), { ...GOOD, outcome: "repeat", repeatWeeks: [1, 2] }, "mgr")).body),
    ).toBe("OVERRIDE_NOTE_REQUIRED");
    // A late recap fails the bar even with good scores.
    expect(errorCode((await put(formPath(), { ...GOOD, recapOnTime: false }, "mgr")).body)).toBe(
      "OVERRIDE_NOTE_REQUIRED",
    );
    const oneWeek = await put(formPath(), { ...LOW, repeatWeeks: [2] }, "mgr");
    expect(oneWeek.status).toBe(400);
    expect(apiErrorBody.parse(oneWeek.body).fields).toEqual({ repeatWeeks: "Choose 2 weeks to repeat." });
    expect((await put(formPath(), { ...LOW, repeatWeeks: [4, 5] }, "mgr")).status).toBe(400);
    expect((await put(formPath(), { ...GOOD, outcome: "pass_focus" }, "mgr")).status).toBe(400);
    expect((await put(formPath(), { ...GOOD, criteria: { "1": null } }, "mgr")).status).toBe(400);
    expect((await put(formPath(), { ...GOOD, criteria: { "12": 3 } }, "mgr")).status).toBe(400);
    expect((await put(formPath(), { ...GOOD, note: "" }, "mgr")).status).toBe(400);
  });

  it("is for the engineer's own managers only", async () => {
    expect((await get(formPath(), "other")).status).toBe(404);
    expect((await put(formPath(), GOOD, "other")).status).toBe(404);
    expect((await put(formPath(), GOOD, "eng")).status).toBe(403);
    expect((await get("/api/manager/gates", "eng")).status).toBe(403);
    expect(gateListResponse.parse((await get("/api/manager/gates", "other")).body).gates).toEqual([]);
  });

  it("records a repeat: Weeks 2–3 reopen as round 2, round 1 is kept", async () => {
    const saved = await put(formPath(), LOW, "mgr");
    expect(saved.status).toBe(200);
    const form = gateFormResponse.parse(saved.body);
    expect(form).toMatchObject({ status: "repeat", round: 1 });
    expect(form.saved?.result).toMatchObject({
      round: 1,
      scored: 6,
      average: 2.17,
      lowest: 1,
      outcome: "repeat",
      repeatWeeks: [2, 3],
      by: { id: fx.id("mgr"), name: `mgr ${fx.tag}` },
    });
    expect(form.saved?.result.criteria["11"]).toBe(2);
    expect(form.saved?.cardId).toBe("S12");

    const plan = myPlanResponse.parse((await get("/api/me/plan", "eng")).body);
    expect(plan.gates[0]?.status).toBe("repeat");
    expect(plan.days.slice(0, 5).map((d) => [d.status, d.round])).toEqual(Array(5).fill(["done", 1]));
    expect(plan.days[5]).toMatchObject({ day: 6, status: "open", round: 2 });
    expect(plan.days[6]).toMatchObject({ day: 7, status: "locked", lockReason: "previous_day", round: 2 });
    expect(plan.days[15]).toMatchObject({ day: 16, status: "done", round: 1 });
    expect(plan.days[20]).toMatchObject({ day: 21, status: "locked", lockReason: "gate" });
    expect(plan.currentDay).toBe(6);
    const outline = courseOutlineResponse.parse((await get("/api/me/course", "eng")).body);
    expect(outline.weeks[1]?.days.map((d) => d.round)).toEqual([2, 2, 2, 2, 2]);

    const view = gateViewResponse.parse((await get("/api/me/gates/1", "eng")).body);
    expect(view).toMatchObject({ status: "repeat", round: 1, result: { outcome: "repeat" }, history: [] });
    expect(view.repeatDays).toEqual(Array.from({ length: 10 }, (_, i) => ({ day: i + 6, done: false })));
    expect(errorCode((await put("/api/me/gates/1/recap", { text: RECAP }, "eng")).body)).toBe(
      "GATE_RECORDED",
    );

    const team = teamResponse.parse((await get("/api/manager/team", "mgr")).body);
    expect(team.engineers.find((e) => e.id === eng())).toMatchObject({
      daysDone: 20,
      next: "Assessment after Day 10",
    });
    expect(team.tasks.filter((t) => t.href.endsWith("/gates/1"))).toEqual([]);

    const { rows } = await fx.owner.query(
      "SELECT after FROM audit_log WHERE actor_id = $1 AND action = 'gate.recorded'",
      [fx.id("mgr")],
    );
    expect(rows.map((row: { after: Record<string, unknown> }) => row.after)).toEqual([
      expect.objectContaining({ outcome: "repeat", round: 1, repeatWeeks: [2, 3], overridden: false }),
    ]);
    expect(JSON.stringify(rows)).not.toContain(LOW.note);
  });

  it("can be edited until the engineer opens a reopened day; then it's fixed", async () => {
    const edited = gateFormResponse.parse(
      (await put(formPath(), { ...LOW, repeatWeeks: [3, 2], rag: "red" }, "mgr")).body,
    );
    expect(edited.saved?.result).toMatchObject({ rag: "red", repeatWeeks: [2, 3] });
    // Opening Day 6 starts round 2: the day shows the new round, without round 1's entries.
    const day = dayViewResponse.parse((await get("/api/me/days/6", "eng")).body);
    expect(day.round).toBe(2);
    expect(day.progress.every((lesson) => !lesson.done && lesson.entry === null)).toBe(true);
    const late = await put(formPath(), LOW, "mgr");
    expect(late.status).toBe(409);
    const { rows } = await fx.owner.query(
      "SELECT round FROM step_entries WHERE user_id = $1 AND day = 6 AND lesson_id = 'round-one-note'",
      [eng()],
    );
    expect(rows).toEqual([{ round: 1 }]);
  });

  it("the tracker shows the gate on Week 4 and the repeat weeks as not done again", async () => {
    const detail = engineerDetailResponse.parse((await get(`/api/manager/engineers/${eng()}`, "mgr")).body);
    expect(detail.tracker[3]).toMatchObject({ week: 4, checkpoint: "gate1", rag: "red", note: LOW.note });
    expect(detail.tracker[1]).toMatchObject({ week: 2, daysDone: 0 });
    expect(detail.progress.gate1).toEqual({ average: 2.17, lowest: 1, passed: false });
    expect(detail.progress.days.done).toBe(20);
    const progress = progressResponse.parse((await get("/api/me/progress", "eng")).body);
    expect(progress.rubric.find((row) => row.criterion === 11)).toEqual({
      criterion: 11,
      average: 2,
      count: 1,
    });
  });
});

describe("the rerun", () => {
  beforeAll(async () => {
    await completeDays(
      Array.from({ length: 10 }, (_, i) => i + 6),
      2,
    );
  });

  it("waits for the repeat weeks' assessments in round 2, then runs as gate round 2", async () => {
    let view = gateViewResponse.parse((await get("/api/me/gates/1", "eng")).body);
    expect(view.status).toBe("repeat");
    expect(view.repeatDays.every((d) => d.done)).toBe(true);
    await passAssessments([10, 15], 2);
    view = gateViewResponse.parse((await get("/api/me/gates/1", "eng")).body);
    expect(view).toMatchObject({ status: "rerun", round: 2, recap: null, result: null, repeatDays: [] });
    expect(view.history.map((r) => [r.round, r.outcome])).toEqual([[1, "repeat"]]);
    const team = teamResponse.parse((await get("/api/manager/team", "mgr")).body);
    expect(team.tasks.find((t) => t.href.endsWith("/gates/1"))?.detail).toBe(
      "Repeat weeks done · book 45 min",
    );
  });

  it("records the pass as round 2: Day 21 opens", async () => {
    const recap = gateViewResponse.parse((await put("/api/me/gates/1/recap", { text: RECAP }, "eng")).body);
    expect(recap).toMatchObject({ status: "recap_sent", round: 2 });
    const form = gateFormResponse.parse((await put(formPath(), GOOD, "mgr")).body);
    expect(form).toMatchObject({
      status: "passed",
      round: 2,
      saved: { result: { round: 2, outcome: "pass" } },
    });
    expect(form.history.map((r) => r.round)).toEqual([1]);

    const plan = myPlanResponse.parse((await get("/api/me/plan", "eng")).body);
    expect(plan.gates[0]?.status).toBe("passed");
    // Day 21 isn't imported yet: no longer locked by the gate, just not ready.
    expect(plan.days[20]).toMatchObject({ day: 21, lockReason: null });
    expect(plan.days[20]?.status).not.toBe("locked");
    const view = gateViewResponse.parse((await get("/api/me/gates/1", "eng")).body);
    expect(view).toMatchObject({ status: "passed", round: 2, result: { outcome: "pass", rag: "green" } });
    const progress = progressResponse.parse((await get("/api/me/progress", "eng")).body);
    expect(progress.gate1).toEqual({ average: 3, lowest: 2, passed: true });
    expect(errorCode((await put("/api/me/gates/1/recap", { text: RECAP }, "eng")).body)).toBe(
      "GATE_RECORDED",
    );
    const list = gateListResponse.parse((await get("/api/manager/gates", "mgr")).body);
    expect(list.gates[0]).toMatchObject({
      status: "passed",
      round: 2,
      result: { outcome: "pass", average: 3 },
    });
  });
});
