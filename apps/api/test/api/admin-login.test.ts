/** Admin email + password sign-in over HTTP: who gets in, and that every failure looks the same. */
import { Test } from "@nestjs/testing";
import { apiErrorBody, CSRF_HEADER, meResponse } from "@portal/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../src/app.module.js";
import { hashPassword } from "../../src/auth/password.js";
import { parseEnv } from "../../src/config/env.js";
import { configureHttp } from "../../src/http.js";
import { Fixtures } from "../fixtures.js";
import type { NestExpressApplication } from "@nestjs/platform-express";

const env = parseEnv(process.env);
const fx = new Fixtures("al");
const PASSWORD = "a long admin password";
let app: NestExpressApplication;

const login = (email: string, password: string) =>
  request(app.getHttpServer())
    .post("/api/auth/admin-login")
    .set("Origin", env.PORTAL_ORIGIN)
    .set(CSRF_HEADER, "1")
    .send({ email, password });

async function setPassword(key: string, password: string): Promise<void> {
  await fx.owner.query("INSERT INTO app.admin_credentials (user_id, password_hash) VALUES ($1, $2)", [
    fx.id(key),
    await hashPassword(password),
  ]);
}

beforeAll(async () => {
  await fx.user("admin", "admin", "active");
  await fx.user("nopass", "admin", "active");
  await fx.user("off", "admin", "active");
  await fx.user("eng", "engineer", "active");
  await fx.user("other", "admin", "active");
  await setPassword("admin", PASSWORD);
  await setPassword("off", PASSWORD);
  await setPassword("eng", PASSWORD);
  await fx.owner.query("UPDATE users SET status = 'disabled' WHERE id = $1", [fx.id("off")]);
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication<NestExpressApplication>({ logger: false });
  configureHttp(app);
  await app.init();
});

afterAll(async () => {
  await app.close();
  await fx.cleanup();
});

describe("admin login", () => {
  it("signs an admin in (any email case) and the session works", async () => {
    const response = await login(fx.emailOf("admin").toUpperCase(), PASSWORD);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ next: "/home" });
    const cookie = (response.get("Set-Cookie") ?? []).find((v) => v.startsWith("cr_session="));
    const me = await request(app.getHttpServer())
      .get("/api/me")
      .set("Cookie", cookie?.split(";")[0] ?? "");
    expect(meResponse.parse(me.body)).toMatchObject({ id: fx.id("admin"), role: "admin" });
  });

  it.each([
    ["wrong password", "admin", "not the password"],
    ["admin without a password", "nopass", PASSWORD],
    ["disabled admin", "off", PASSWORD],
    ["non-admin with a password", "eng", PASSWORD],
    ["unknown email", "ghost", PASSWORD],
  ])("refuses %s with the same error", async (_label, key, password) => {
    const response = await login(fx.emailOf(key), password);
    expect(response.status).toBe(401);
    expect(apiErrorBody.parse(response.body).code).toBe("INVALID_CREDENTIALS");
    expect(response.get("Set-Cookie")).toBeUndefined();
  });

  it("removes the password when an admin is demoted, so promoting again needs a new one", async () => {
    await setPassword("other", PASSWORD);
    await fx.owner.query("UPDATE users SET role = 'engineer' WHERE id = $1", [fx.id("other")]);
    await fx.owner.query("UPDATE users SET role = 'admin' WHERE id = $1", [fx.id("other")]);
    expect((await login(fx.emailOf("other"), PASSWORD)).status).toBe(401);
  });

  it("is not readable by the app role", async () => {
    const rows = await fx.owner.query(
      "SELECT has_table_privilege('app_rw', 'app.admin_credentials', 'SELECT') AS can",
    );
    expect(rows.rows[0]).toEqual({ can: false });
  });
});

describe("admin sets their own password", () => {
  /** A session through the test sign-in, so these tests don't use up the password form's rate limit. */
  const session = async (key: string) =>
    (
      await request(app.getHttpServer())
        .post("/api/auth/dev-login")
        .set("Origin", env.PORTAL_ORIGIN)
        .set(CSRF_HEADER, "1")
        .send({ email: fx.emailOf(key) })
    )
      .get("Set-Cookie")
      ?.find((v) => v.startsWith("cr_session="))
      ?.split(";")[0] ?? "";
  const post = (cookie: string, body: object) =>
    request(app.getHttpServer())
      .post("/api/auth/admin-password")
      .set("Cookie", cookie)
      .set("Origin", env.PORTAL_ORIGIN)
      .set(CSRF_HEADER, "1")
      .send(body);

  it("needs the current password to change one, then the new one signs in", async () => {
    const cookie = await session("admin");
    const status = await request(app.getHttpServer()).get("/api/auth/admin-password").set("Cookie", cookie);
    expect(status.body).toEqual({ hasPassword: true });

    expect((await post(cookie, { newPassword: "another long password" })).status).toBe(401);
    expect((await post(cookie, { currentPassword: PASSWORD, newPassword: "short" })).status).toBe(400);
    expect(
      (await post(cookie, { currentPassword: PASSWORD, newPassword: "another long password" })).status,
    ).toBe(204);
    expect((await login(fx.emailOf("admin"), PASSWORD)).status).toBe(401);
    expect((await login(fx.emailOf("admin"), "another long password")).status).toBe(200);
  });

  it("lets an admin without a password set the first one, and refuses everyone else", async () => {
    await fx.user("first", "admin", "active");
    await fx.user("worker", "engineer", "active");
    expect((await post(await session("first"), { newPassword: "a brand new password" })).status).toBe(204);
    expect((await login(fx.emailOf("first"), "a brand new password")).status).toBe(200);
    expect((await post(await session("worker"), { newPassword: "a brand new password" })).status).toBe(403);
  });
});
