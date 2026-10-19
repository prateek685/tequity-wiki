/**
 * Admin Settings end to end (real NestJS app, local Postgres): read the editable settings and the AI
 * scorer's state, change them with validation and an audit entry. Admin only. The settings this test
 * changes are put back afterwards.
 */
import { Test } from "@nestjs/testing";
import { apiErrorBody, CSRF_HEADER, SETTING_KEYS, settingsResponse } from "@portal/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../src/app.module.js";
import { parseEnv } from "../../src/config/env.js";
import { configureHttp } from "../../src/http.js";
import { llmMode } from "../../src/llm/llm.module.js";
import { Fixtures } from "../fixtures.js";
import type { NestExpressApplication } from "@nestjs/platform-express";

const env = parseEnv(process.env);
const fx = new Fixtures("st");
const ORIGIN = env.PORTAL_ORIGIN;
let app: NestExpressApplication;
const cookies: Record<string, string> = {};
const CHANGED = ["assessment.retakeHours", "pace.behindToleranceDays"];
let saved: { key: string; value: unknown }[] = [];

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

const get = (who: string) =>
  request(app.getHttpServer())
    .get("/api/admin/settings")
    .set("Cookie", cookies[who] ?? "");
const put = (body: object, who = "admin") =>
  request(app.getHttpServer())
    .put("/api/admin/settings")
    .set("Cookie", cookies[who] ?? "")
    .set("Origin", ORIGIN)
    .set(CSRF_HEADER, "1")
    .send(body);

beforeAll(async () => {
  if (process.env.DEV_LOGIN_ENABLED !== "true")
    throw new Error("Set DEV_LOGIN_ENABLED=true in apps/api/.env");
  await fx.user("admin", "admin", "active");
  await fx.user("manager", "manager", "active");
  await fx.user("eng", "engineer", "active");
  saved = (
    await fx.owner.query<{ key: string; value: unknown }>(
      "SELECT key, value FROM settings WHERE key = ANY($1)",
      [CHANGED],
    )
  ).rows;
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication<NestExpressApplication>({ logger: false });
  configureHttp(app);
  await app.init();
  for (const key of ["admin", "manager", "eng"]) cookies[key] = await signIn(key);
});

afterAll(async () => {
  await fx.owner.query("DELETE FROM settings WHERE key = ANY($1)", [CHANGED]);
  for (const row of saved) {
    await fx.owner.query("INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)", [
      row.key,
      JSON.stringify(row.value),
    ]);
  }
  await app?.close();
  await fx.cleanup();
});

describe("admin settings", () => {
  it("returns every editable setting and the AI scorer's state", async () => {
    const response = await get("admin");
    expect(response.status).toBe(200);
    const settings = settingsResponse.parse(response.body);
    expect(Object.keys(settings.values).sort()).toEqual([...SETTING_KEYS].sort());
    expect(typeof settings.values["learning.unlockAll"]).toBe("boolean");
    expect(settings.ai.mode).toBe(llmMode(env));
    expect(settings.ai.model).toBe(env.LLM_SCORING_MODEL);
    expect(settings.ai.pending).toBeGreaterThanOrEqual(0);
    expect(settings.ai.failed).toBeGreaterThanOrEqual(0);
  });

  it("is for admins only", async () => {
    expect((await get("manager")).status).toBe(403);
    expect((await get("eng")).status).toBe(403);
    expect((await put({ values: { "assessment.retakeHours": 1 } }, "manager")).status).toBe(403);
  });

  it("checks each value against the setting and changes nothing when one is wrong", async () => {
    const before = settingsResponse.parse((await get("admin")).body).values;
    const response = await put({
      values: { "assessment.retakeHours": 12, "pace.behindToleranceDays": 31, "plan.targetDays": 80 },
    });
    expect(response.status).toBe(400);
    expect(apiErrorBody.parse(response.body).fields).toEqual({
      "values.pace.behindToleranceDays": "Use a whole number from 0 to 30.",
      "values.plan.targetDays": "This setting can't be changed here.",
    });
    expect(settingsResponse.parse((await get("admin")).body).values).toEqual(before);
  });

  it("saves only the keys sent, with an audit entry from the old value to the new one", async () => {
    const before = settingsResponse.parse((await get("admin")).body).values;
    const response = await put({ values: { "assessment.retakeHours": 12, "pace.behindToleranceDays": 5 } });
    expect(response.status).toBe(200);
    const after = settingsResponse.parse(response.body).values;
    expect(after).toEqual({ ...before, "assessment.retakeHours": 12, "pace.behindToleranceDays": 5 });
    const { rows } = await fx.owner.query(
      "SELECT entity_id, before, after FROM audit_log WHERE actor_id = $1 AND action = 'setting.changed' ORDER BY entity_id",
      [fx.id("admin")],
    );
    expect(rows).toEqual([
      {
        entity_id: "assessment.retakeHours",
        before: { value: before["assessment.retakeHours"] },
        after: { value: 12 },
      },
      {
        entity_id: "pace.behindToleranceDays",
        before: { value: before["pace.behindToleranceDays"] },
        after: { value: 5 },
      },
    ]);
  });
});
