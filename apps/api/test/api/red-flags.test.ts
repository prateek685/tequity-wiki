/**
 * Red flags and manager emails end to end (local Postgres): the worker's per-engineer run raises the flags
 * the engineer's data meets and saves the email items (a check-in due, the new flags), idempotently; the
 * email job sends one email per manager through the fake client; the manager lists and acknowledges flags
 * through the API; the Team page shows the open kinds. Only this file's engineer is run (never the whole
 * dev database).
 */
import { Test } from "@nestjs/testing";
import { apiErrorBody, CSRF_HEADER, redFlagListResponse, teamResponse } from "@portal/contracts";
import { PinoLogger } from "nestjs-pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../src/app.module.js";
import { isoFromDate } from "../../src/common/dates.js";
import { parseEnv } from "../../src/config/env.js";
import { type EmailQueue } from "../../src/email/email-queue.js";
import { EmailProcessor } from "../../src/email/email.processor.js";
import { FakeEmailClient } from "../../src/email/fake-email-client.js";
import { configureHttp } from "../../src/http.js";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { RedFlagRunner } from "../../src/red-flags/red-flag-run.js";
import { Fixtures } from "../fixtures.js";
import type { NestExpressApplication } from "@nestjs/platform-express";

const env = parseEnv(process.env);
const fx = new Fixtures("rfa");
const ORIGIN = env.PORTAL_ORIGIN;
const prisma = new PrismaService(env);
const logger = new PinoLogger({ pinoHttp: { level: "silent" } });
const queued: string[][] = [];
const emailQueue = {
  enqueue: (ids: readonly string[]) => {
    queued.push([...ids]);
    return Promise.resolve();
  },
} as unknown as EmailQueue;
const runner = new RedFlagRunner(prisma, emailQueue, logger);
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
const post = (path: string, who: string) =>
  request(app.getHttpServer())
    .post(path)
    .set("Cookie", cookies[who] ?? "")
    .set("Origin", ORIGIN)
    .set(CSRF_HEADER, "1")
    .send({});
const daysAgo = (days: number) => isoFromDate(new Date(Date.now() - days * 86_400_000));
const eng = () => fx.id("eng");

beforeAll(async () => {
  if (process.env.DEV_LOGIN_ENABLED !== "true")
    throw new Error("Set DEV_LOGIN_ENABLED=true in apps/api/.env");
  await fx.user("mgr", "manager", "active");
  await fx.user("other", "manager", "active");
  await fx.user("eng", "engineer", "active");
  const team = await fx.team("team");
  await fx.team("otherteam");
  await fx.owner.query("INSERT INTO team_members (user_id, team_id) VALUES ($1, $2)", [eng(), team]);
  await fx.owner.query("INSERT INTO team_managers (team_id, user_id) VALUES ($1, $2)", [team, fx.id("mgr")]);
  const enrollment = await fx.insertId(
    "enr_eng",
    "INSERT INTO enrollments (user_id, start_date) VALUES ($1, $2) RETURNING id",
    [eng(), daysAgo(45)],
  );
  // Days 1–10 done 40 to 22 days ago, nothing since; the Week 2 scorecard was 22 days ago; no check-in.
  for (let day = 1; day <= 10; day++) {
    await fx.owner.query(
      `INSERT INTO day_progress (enrollment_id, user_id, day, completed_at)
       VALUES ($1, $2, $3::int, now() - interval '1 day' * (42 - 2 * $3::int))`,
      [enrollment, eng(), day],
    );
  }
  for (const week of [1, 2]) {
    await fx.owner.query(
      `INSERT INTO scorecards (enrollment_id, user_id, week, day, ratings, pillar_scores, proof, days_completed, mocks_done, submitted_at)
       VALUES ($1, $2, $3, $4, '{}', '{"communicate": 3}', '{}', 5, 2, now() - interval '1 day' * $5::int)`,
      [enrollment, eng(), week, week * 5, week === 1 ? 32 : 22],
    );
  }

  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication<NestExpressApplication>({ logger: false });
  configureHttp(app);
  await app.init();
  for (const key of ["mgr", "other", "eng"]) cookies[key] = await signIn(key);
});

afterAll(async () => {
  await app?.close();
  await prisma.onModuleDestroy();
  await fx.cleanup();
});

describe("the hourly run", () => {
  it("raises the flags the engineer's data meets and saves the email items", async () => {
    const result = await runner.runFor(eng());
    expect(result.evaluation?.signals.map((s) => s.kind)).toEqual(["scorecard_missing", "few_practice_days"]);
    expect(result).toMatchObject({ raised: 2 });
    const items = await fx.owner.query<{ template: string; recipient_id: string }>(
      "SELECT template, recipient_id FROM email_log WHERE recipient_id = $1 ORDER BY template",
      [fx.id("mgr")],
    );
    expect(items.rows.map((r) => r.template)).toEqual(["red_flag", "red_flag"]);
  });

  it("is idempotent: nothing new on the next run", async () => {
    expect(await runner.runFor(eng())).toMatchObject({ raised: 0 });
    const { rows } = await fx.owner.query("SELECT id FROM red_flags WHERE user_id = $1", [eng()]);
    expect(rows).toHaveLength(2);
  });

  it("queues one email job per manager with pending items", async () => {
    await runner.queueEmails();
    expect(queued.at(-1)).toContain(fx.id("mgr"));
    expect(queued.at(-1)).not.toContain(fx.id("other"));
  });

  it("sends one email per manager listing every item, once", async () => {
    const fake = new FakeEmailClient();
    const processor = new EmailProcessor(prisma, fake, env, logger);
    expect(await processor.send(fx.id("mgr"), false)).toBe("sent");
    expect(fake.outbox).toHaveLength(1);
    const email = fake.outbox[0];
    expect(email?.to).toBe(fx.emailOf("mgr"));
    expect(email?.subject).toBe("Client-Ready 90 days plan: 2 new red flags");
    expect(email?.text).not.toContain("coming due");
    expect(email?.text).toContain("Scorecard missing 2 weeks in a row");
    expect(email?.text).toContain(`${ORIGIN}/manager/red-flags`);
    expect(await processor.send(fx.id("mgr"), false)).toBe("nothing");
    expect(fake.outbox).toHaveLength(1);
    const { rows } = await fx.owner.query<{ status: string }>(
      "SELECT DISTINCT status FROM email_log WHERE recipient_id = $1",
      [fx.id("mgr")],
    );
    expect(rows).toEqual([{ status: "sent" }]);
  });

  it("a failed send keeps the items pending until the last attempt", async () => {
    // A new signal: a gate recorded as repeat.
    await fx.owner.query(
      `INSERT INTO gate_results (enrollment_id, user_id, gate, round, held_at, scored, average, lowest,
         recap_on_time, outcome, repeat_weeks, rag, note, manager_id)
       VALUES ($1, $2, 1, 1, now(), 2, 1.5, 1, true, 'repeat', '{1,2}', 'red', 'Not yet.', $3)`,
      [fx.id("enr_eng"), eng(), fx.id("mgr")],
    );
    expect(await runner.runFor(eng())).toMatchObject({ raised: 1 });
    const broken = new FakeEmailClient();
    broken.send = () => Promise.reject(new Error("down"));
    const processor = new EmailProcessor(prisma, broken, env, logger);
    await expect(processor.send(fx.id("mgr"), false)).rejects.toThrow("down");
    const status = async () =>
      (
        await fx.owner.query<{ status: string }>(
          "SELECT status FROM email_log WHERE recipient_id = $1 AND payload->>'kind' = 'gate_not_passed'",
          [fx.id("mgr")],
        )
      ).rows[0]?.status;
    expect(await status()).toBe("pending");
    await expect(processor.send(fx.id("mgr"), true)).rejects.toThrow("down");
    expect(await status()).toBe("failed");
  });
});

describe("the manager's red flags", () => {
  it("lists the open flags of their engineers only; engineers can't see them", async () => {
    const list = redFlagListResponse.parse((await get("/api/manager/red-flags", "mgr")).body);
    expect(list.open).toBe(3);
    expect(list.flags.map((f) => f.kind).sort()).toEqual([
      "few_practice_days",
      "gate_not_passed",
      "scorecard_missing",
    ]);
    expect(list.flags[0]).toMatchObject({
      engineer: { id: eng(), name: `eng ${fx.tag}` },
      acknowledgedAt: null,
      acknowledgedBy: null,
    });
    expect(list.flags.find((f) => f.kind === "gate_not_passed")?.detail).toBe("Gate 1, round 1");
    expect(redFlagListResponse.parse((await get("/api/manager/red-flags", "other")).body)).toEqual({
      flags: [],
      open: 0,
    });
    expect((await get("/api/manager/red-flags", "eng")).status).toBe(403);
  });

  it("shows the open kinds on the Team page", async () => {
    const team = teamResponse.parse((await get("/api/manager/team", "mgr")).body);
    expect(team.engineers.find((e) => e.id === eng())?.flags).toEqual([
      "scorecard_missing",
      "few_practice_days",
      "gate_not_passed",
    ]);
    expect(team.kpis.redFlags).toBe(3);
  });

  it("acknowledges a flag (audited) and keeps it in the acknowledged list", async () => {
    const before = redFlagListResponse.parse((await get("/api/manager/red-flags", "mgr")).body);
    const flag = before.flags.find((f) => f.kind === "scorecard_missing");
    if (!flag) throw new Error("no flag");
    expect((await post(`/api/manager/red-flags/${flag.id}/acknowledge`, "other")).status).toBe(404);
    const after = redFlagListResponse.parse(
      (await post(`/api/manager/red-flags/${flag.id}/acknowledge`, "mgr")).body,
    );
    expect(after.open).toBe(2);
    expect(after.flags.map((f) => f.id)).not.toContain(flag.id);
    // Twice is fine: the first acknowledgement stays.
    expect((await post(`/api/manager/red-flags/${flag.id}/acknowledge`, "mgr")).status).toBe(200);
    const acknowledged = redFlagListResponse.parse(
      (await get("/api/manager/red-flags?status=acknowledged", "mgr")).body,
    );
    expect(acknowledged.flags).toEqual([
      expect.objectContaining({
        id: flag.id,
        acknowledgedBy: { id: fx.id("mgr"), name: `mgr ${fx.tag}` },
      }),
    ]);
    const { rows } = await fx.owner.query(
      "SELECT entity_id, after FROM audit_log WHERE actor_id = $1 AND action = 'red_flag.acknowledged'",
      [fx.id("mgr")],
    );
    expect(rows).toEqual([{ entity_id: flag.id, after: { engineer: eng(), kind: "scorecard_missing" } }]);
    const missing = await post(
      "/api/manager/red-flags/00000000-0000-4000-8000-000000000000/acknowledge",
      "mgr",
    );
    expect(apiErrorBody.parse(missing.body).code).toBe("NOT_FOUND");
    expect((await post("/api/manager/red-flags/not-a-uuid/acknowledge", "mgr")).status).toBe(400);
  });

  it("an acknowledged flag whose signal is still on isn't raised again", async () => {
    expect(await runner.runFor(eng())).toMatchObject({ raised: 0 });
    const team = teamResponse.parse((await get("/api/manager/team", "mgr")).body);
    expect(team.engineers.find((e) => e.id === eng())?.flags).toEqual([
      "few_practice_days",
      "gate_not_passed",
    ]);
  });
});
