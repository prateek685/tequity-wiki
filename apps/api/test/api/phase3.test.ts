/**
 * Phase 3 end to end (real NestJS app, local Postgres): a live lesson needs a path and shows the Gate 2
 * live-call plan; "later" is remembered; managers see the paths (never the call sheet); Day 64 starts from
 * Day 63's draft and shares the readiness case; the final review opens then, is refused while a live call
 * is still "later", needs an override note against the scores, and shows up for the engineer, on the Team
 * page and on Progress; the shared case stays as reviewed. Plus the Library. Uses test/content-fixtures.ts
 * (Days 1–2, 36–40, 43, 48, 63, 64) with `learning.unlockAll` on.
 */
import { Test } from "@nestjs/testing";
import {
  apiErrorBody,
  CSRF_HEADER,
  dayViewResponse,
  engineerDetailResponse,
  finalReviewFormResponse,
  finalReviewListResponse,
  finalReviewViewResponse,
  libraryResponse,
  progressResponse,
  type SaveFinalReviewRequest,
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
const fx = new Fixtures("p3");
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
const formPath = () => `/api/manager/engineers/${eng()}/final-review`;
const PLAN = "Shadow the Lakeside weekly status (Day 43), co-lead the Brightpath demo prep (Day 48).";
const NOTES = "Private call sheet: Dana asked about the HL7 feed twice.";
const lesson = (day: number, id: string, body: object) =>
  put(`/api/me/days/${day}/lessons/${id}`, { values: {}, ...body }, "eng");

/** Average 3.75, lowest 3: Client-ready. */
const REVIEW: SaveFinalReviewRequest = {
  heldAt: new Date(Date.now() - 3_600_000).toISOString(),
  observer: "manager",
  call: "Day 62 solo call: CareBook weekly sync",
  criteria: { "1": 4, "2": 4, "3": 3, "11": 4 },
  outcome: "client_ready",
  rag: "green",
  note: "Led the call end to end.",
  overrideNote: "",
};

beforeAll(async () => {
  if (process.env.DEV_LOGIN_ENABLED !== "true")
    throw new Error("Set DEV_LOGIN_ENABLED=true in apps/api/.env");
  await fx.user("mgr", "manager", "active");
  await fx.user("other", "manager", "active");
  await fx.user("eng", "engineer", "active");
  const team = await fx.team("team");
  await fx.owner.query("INSERT INTO team_members (user_id, team_id) VALUES ($1, $2)", [eng(), team]);
  await fx.owner.query("INSERT INTO team_managers (team_id, user_id) VALUES ($1, $2)", [team, fx.id("mgr")]);
  await fx.insertId("enr_eng", "INSERT INTO enrollments (user_id, start_date) VALUES ($1, $2) RETURNING id", [
    eng(),
    daysAgo(90),
  ]);
  await content.install();
  await content.installPhaseTwo();
  await content.installPhaseThree();
  await content.setUnlockAll(true);
  await fx.owner.query(
    `INSERT INTO gate_results (enrollment_id, user_id, gate, round, held_at, scored, average, lowest,
       recap_on_time, outcome, rag, note, manager_id, healthcare_terms, live_call_plan)
     VALUES ($1, $2, 2, 1, now() - interval '20 days', 4, 3, 3, true, 'pass', 'green', 'Passed.', $3, true, $4)`,
    [fx.id("enr_eng"), eng(), fx.id("mgr"), PLAN],
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

describe("live-call days", () => {
  it("show the role and the Gate 2 live-call plan", async () => {
    const view = dayViewResponse.parse((await get("/api/me/days/43", "eng")).body);
    expect(view.type).toBe("live_call");
    expect(view.lessons[0]).toMatchObject({
      kind: "live",
      liveRole: "shadow",
      substituteCardId: PHASE_TWO_CARD_ID,
    });
    expect(view.livePlan).toBe(PLAN);
  });

  it("need a path; 'later' is remembered after the call is done", async () => {
    const missing = await lesson(43, "live", { values: { notes: NOTES } });
    expect(missing.status).toBe(400);
    expect(apiErrorBody.parse(missing.body).fields).toHaveProperty("livePath");
    expect((await lesson(43, "live", { livePath: "later", values: { notes: NOTES } })).status).toBe(200);
    expect((await lesson(48, "live", { livePath: "substitute" })).status).toBe(200);

    const detail = engineerDetailResponse.parse((await get(`/api/manager/engineers/${eng()}`, "mgr")).body);
    // The database may also hold the real course's live days: only the two saved here matter.
    expect(detail.liveCalls.filter((call) => call.path !== null)).toEqual([
      expect.objectContaining({ day: 43, role: "shadow", path: "later", deferred: true }),
      expect.objectContaining({ day: 48, role: "co_lead", path: "substitute", deferred: false }),
    ]);
    // The call sheet stays private: nothing of it reaches the manager.
    expect(JSON.stringify(detail)).not.toContain("HL7 feed twice");
  });
});

describe("readiness case and final review", () => {
  it("is locked before the readiness case is shared", async () => {
    const view = finalReviewViewResponse.parse((await get("/api/me/final-review", "eng")).body);
    expect(view).toMatchObject({ status: "locked", reachedAt: null, pendingLive: [43], result: null });
    expect(errorCode((await put(formPath(), REVIEW, "mgr")).body)).toBe("FINAL_NOT_REACHED");
    const list = finalReviewListResponse.parse((await get("/api/manager/final-reviews", "mgr")).body);
    expect(list.reviews.find((row) => row.engineer.id === eng())).toBeUndefined();
  });

  it("Day 64 starts from Day 63's draft and shares the case on save", async () => {
    const draft = {
      understand: "Recap of the Day 45 call; status report.",
      overall: "Ready, with PM backup.",
    };
    expect((await lesson(63, "draft", { values: draft })).status).toBe(200);
    const day64 = dayViewResponse.parse((await get("/api/me/days/64", "eng")).body);
    expect(day64.recalls).toEqual([{ day: 63, lesson: "draft", values: draft }]);
    expect((await lesson(64, "final", { values: { ...draft, overall: "Ready." } })).status).toBe(200);

    const view = finalReviewViewResponse.parse((await get("/api/me/final-review", "eng")).body);
    expect(view.status).toBe("to_book");
    const form = finalReviewFormResponse.parse((await get(formPath(), "mgr")).body);
    expect(form).toMatchObject({ status: "to_book", reached: true, saved: null });
    expect(form.readinessCase?.fields).toEqual([
      { id: "understand", label: "understand", value: draft.understand },
      { id: "overall", label: "overall", value: "Ready." },
    ]);
    const list = finalReviewListResponse.parse((await get("/api/manager/final-reviews", "mgr")).body);
    expect(list.reviews.find((row) => row.engineer.id === eng())).toMatchObject({
      status: "to_book",
      pendingLive: 1,
    });
  });

  it("only the engineer's managers see it", async () => {
    expect((await get(formPath(), "other")).status).toBe(404);
    expect((await get(formPath(), "eng")).status).toBe(403);
  });

  it("is refused while a live call is 'later', then needs a note against the scores", async () => {
    expect(errorCode((await put(formPath(), REVIEW, "mgr")).body)).toBe("LIVE_CALLS_PENDING");
    expect((await lesson(43, "live", { livePath: "had_call", values: { notes: NOTES } })).status).toBe(200);
    const live = finalReviewViewResponse.parse((await get("/api/me/final-review", "eng")).body);
    expect(live.pendingLive).toEqual([]);

    const against = { ...REVIEW, outcome: "light_support" as const };
    expect(errorCode((await put(formPath(), against, "mgr")).body)).toBe("OVERRIDE_NOTE_REQUIRED");
    const saved = finalReviewFormResponse.parse((await put(formPath(), REVIEW, "mgr")).body);
    expect(saved.saved).toMatchObject({ outcome: "client_ready", average: 3.75, lowest: 3, scored: 4 });
    expect(saved.liveCalls[0]).toMatchObject({ day: 43, path: "had_call", deferred: true });
  });

  it("shows the decision to the engineer, on the Team page and on Progress", async () => {
    const view = finalReviewViewResponse.parse((await get("/api/me/final-review", "eng")).body);
    expect(view.status).toBe("recorded");
    expect(view.result).toMatchObject({
      outcome: "client_ready",
      by: { id: fx.id("mgr"), name: `mgr ${fx.tag}` },
    });
    const team = teamResponse.parse((await get("/api/manager/team", "mgr")).body);
    expect(team.engineers.find((e) => e.id === eng())?.finalOutcome).toBe("client_ready");
    const progress = progressResponse.parse((await get("/api/me/progress", "eng")).body);
    expect(progress.finalReview).toEqual({ outcome: "client_ready", average: 3.75 });
  });

  it("keeps the shared case as reviewed", async () => {
    expect(
      (await lesson(64, "final", { values: { understand: "Changed later.", overall: "x" } })).status,
    ).toBe(200);
    const form = finalReviewFormResponse.parse((await get(formPath(), "mgr")).body);
    expect(form.readinessCase?.fields[1]?.value).toBe("Ready.");
  });
});

describe("Library", () => {
  it("lists the mock cards with the first day that uses them", async () => {
    const library = libraryResponse.parse((await get("/api/library", "eng")).body);
    expect(library.cards.find((card) => card.id === PHASE_TWO_CARD_ID)?.day).toBe(36);
    expect(JSON.stringify(library)).not.toContain("You are the client");
    expect((await get("/api/library", "mgr")).status).toBe(200);
  });
});
