/**
 * The manager's Team and Gates pages load each kind of data once for the whole team, so the number of
 * database queries doesn't grow with the number of engineers. Counted on the pg driver (Prisma's adapter
 * and the session lookup both go through `pg.Client.prototype.query`) while one request runs.
 */
import { Test } from "@nestjs/testing";
import { CSRF_HEADER, gateListResponse, teamResponse } from "@portal/contracts";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../../src/app.module.js";
import { isoFromDate } from "../../src/common/dates.js";
import { parseEnv } from "../../src/config/env.js";
import { configureHttp } from "../../src/http.js";
import { Fixtures } from "../fixtures.js";
import type { NestExpressApplication } from "@nestjs/platform-express";

const env = parseEnv(process.env);
const fx = new Fixtures("mq");
let app: NestExpressApplication;
let cookie = "";
let team = "";
let engineers = 0;

const daysAgo = (days: number) => isoFromDate(new Date(Date.now() - days * 86_400_000));

/** An enrolled engineer on the team with a few days done, a check-in and a scorecard. */
async function addEngineer(): Promise<void> {
  const key = `eng${engineers++}`;
  const user = await fx.user(key, "engineer", "active");
  await fx.owner.query("INSERT INTO team_members (user_id, team_id) VALUES ($1, $2)", [user, team]);
  const enrollment = await fx.insertId(
    `enr_${key}`,
    "INSERT INTO enrollments (user_id, start_date) VALUES ($1, $2) RETURNING id",
    [user, daysAgo(15)],
  );
  for (let day = 1; day <= 5; day++) {
    await fx.owner.query(
      `INSERT INTO day_progress (enrollment_id, user_id, day, completed_at)
       VALUES ($1, $2, $3, now() - (15 - $3) * interval '1 day')`,
      [enrollment, user, day],
    );
  }
}

/** The number of queries the request runs (including the session lookup and the transaction). */
async function queriesFor(path: string): Promise<{ count: number; body: unknown }> {
  const spy = vi.spyOn(pg.Client.prototype, "query");
  try {
    const response = await request(app.getHttpServer()).get(path).set("Cookie", cookie);
    expect(response.status).toBe(200);
    return { count: spy.mock.calls.length, body: response.body };
  } finally {
    spy.mockRestore();
  }
}

beforeAll(async () => {
  if (process.env.DEV_LOGIN_ENABLED !== "true")
    throw new Error("Set DEV_LOGIN_ENABLED=true in apps/api/.env");
  const manager = await fx.user("mgr", "manager", "active");
  team = await fx.team("team");
  await fx.owner.query("INSERT INTO team_managers (team_id, user_id) VALUES ($1, $2)", [team, manager]);
  await addEngineer();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureHttp(app);
  await app.init();
  const login = await request(app.getHttpServer())
    .post("/api/auth/dev-login")
    .set("Origin", env.PORTAL_ORIGIN)
    .set(CSRF_HEADER, "1")
    .send({ email: fx.emailOf("mgr") });
  expect(login.status).toBe(200);
  cookie =
    login
      .get("Set-Cookie")
      ?.find((value) => value.startsWith("cr_session="))
      ?.split(";")[0] ?? "";
});

afterAll(async () => {
  await app?.close();
  await fx.cleanup();
});

describe("manager pages: queries per team, not per engineer", () => {
  it("Team and Gates run the same number of queries for 1 and 6 engineers", async () => {
    const teamOne = await queriesFor("/api/manager/team");
    const gatesOne = await queriesFor("/api/manager/gates");
    expect(teamResponse.parse(teamOne.body).engineers).toHaveLength(1);
    gateListResponse.parse(gatesOne.body);

    for (let i = 0; i < 5; i++) await addEngineer();
    const teamSix = await queriesFor("/api/manager/team");
    const gatesSix = await queriesFor("/api/manager/gates");
    expect(teamResponse.parse(teamSix.body).engineers).toHaveLength(6);

    expect(teamOne.count).toBeGreaterThan(0);
    expect(teamSix.count).toBe(teamOne.count);
    expect(gatesSix.count).toBe(gatesOne.count);
  });
});
