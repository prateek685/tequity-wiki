/**
 * The HTTP API end to end (real NestJS app, local Postgres and Redis): sign-in, sessions, CSRF,
 * role guards and error shapes. Uses the dev login, so DEV_LOGIN_ENABLED must be true locally.
 */
import { Test } from "@nestjs/testing";
import { apiErrorBody, CSRF_HEADER, meResponse } from "@portal/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../src/app.module.js";
import { parseEnv } from "../../src/config/env.js";
import { configureHttp } from "../../src/http.js";
import { Fixtures } from "../fixtures.js";
import type { NestExpressApplication } from "@nestjs/platform-express";

const env = parseEnv(process.env);
const fx = new Fixtures("h");
const ORIGIN = env.PORTAL_ORIGIN;
let app: NestExpressApplication;

/** Sign in through the dev login and return the session cookie. */
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

const get = (path: string, cookie?: string) => {
  const call = request(app.getHttpServer()).get(path);
  return cookie ? call.set("Cookie", cookie) : call;
};

const patch = (path: string, cookie: string, body: object) =>
  request(app.getHttpServer())
    .patch(path)
    .set("Cookie", cookie)
    .set("Origin", ORIGIN)
    .set(CSRF_HEADER, "1")
    .send(body);

beforeAll(async () => {
  if (process.env.DEV_LOGIN_ENABLED !== "true")
    throw new Error("Set DEV_LOGIN_ENABLED=true in apps/api/.env");
  await fx.user("admin", "admin", "active");
  await fx.user("manager", "manager", "active");
  await fx.user("eng", "engineer", "active");
  await fx.user("pending", null, "pending");
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication<NestExpressApplication>({ logger: false });
  configureHttp(app);
  await app.init();
});

afterAll(async () => {
  await app.close();
  await fx.cleanup();
});

describe("sign-in and sessions", () => {
  it("returns the signed-in user and where to go", async () => {
    const cookie = await signIn("admin");
    expect(cookie).toMatch(/^cr_session=/);
    const me = await get("/api/me", cookie);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ id: fx.id("admin"), role: "admin", status: "active" });
  });

  it("sets the session cookie httpOnly and SameSite=Lax", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/auth/dev-login")
      .set("Origin", ORIGIN)
      .set(CSRF_HEADER, "1")
      .send({ email: fx.emailOf("eng") });
    const cookie = response.get("Set-Cookie")?.find((value) => value.startsWith("cr_session=")) ?? "";
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(response.body).toEqual({ next: "/home" });
  });

  it("refuses requests without a session", async () => {
    const response = await get("/api/me");
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ code: "UNAUTHENTICATED", message: "Please sign in." });
  });

  it("applies a role change on the very next request", async () => {
    const cookie = await signIn("manager");
    expect((await get("/api/manager/engineers", cookie)).status).toBe(200);
    await fx.owner.query("UPDATE users SET role = 'engineer' WHERE id = $1", [fx.id("manager")]);
    expect(meResponse.parse((await get("/api/me", cookie)).body).role).toBe("engineer");
    expect((await get("/api/manager/engineers", cookie)).status).toBe(403);
    await fx.owner.query("UPDATE users SET role = 'manager' WHERE id = $1", [fx.id("manager")]);
  });

  it("signs a disabled user out at once", async () => {
    const cookie = await signIn("eng");
    expect((await get("/api/me", cookie)).status).toBe(200);
    await fx.owner.query("UPDATE users SET status = 'disabled' WHERE id = $1", [fx.id("eng")]);
    expect((await get("/api/me", cookie)).status).toBe(401);
    await fx.owner.query("UPDATE users SET status = 'active' WHERE id = $1", [fx.id("eng")]);
  });

  it("ends the session on logout", async () => {
    const cookie = await signIn("eng");
    const logout = await request(app.getHttpServer())
      .post("/api/auth/logout")
      .set("Cookie", cookie)
      .set("Origin", ORIGIN)
      .set(CSRF_HEADER, "1");
    expect(logout.status).toBe(204);
    expect((await get("/api/me", cookie)).status).toBe(401);
  });

  it("lets pending users see who they are, but nothing else", async () => {
    const cookie = await signIn("pending");
    expect(meResponse.parse((await get("/api/me", cookie)).body).status).toBe("pending");
    expect((await get("/api/me/enrollment", cookie)).status).toBe(403);
  });
});

describe("CSRF", () => {
  it("rejects state-changing requests without the header or from another origin", async () => {
    const cookie = await signIn("admin");
    const body = { role: "engineer", status: "active", teamId: "", startDate: "" };
    const path = `/api/admin/users/${fx.id("manager")}`;
    const noHeader = await request(app.getHttpServer())
      .patch(path)
      .set("Cookie", cookie)
      .set("Origin", ORIGIN)
      .send(body);
    expect(noHeader.status).toBe(403);
    expect(apiErrorBody.parse(noHeader.body).code).toBe("CSRF_REJECTED");
    const otherOrigin = await request(app.getHttpServer())
      .patch(path)
      .set("Cookie", cookie)
      .set("Origin", "https://evil.example")
      .set(CSRF_HEADER, "1")
      .send(body);
    expect(otherOrigin.status).toBe(403);
  });
});

describe("role guards", () => {
  it("lets each role reach only its own routes", async () => {
    const admin = await signIn("admin");
    const manager = await signIn("manager");
    const engineer = await signIn("eng");
    expect((await get("/api/admin/users", admin)).status).toBe(200);
    expect((await get("/api/admin/users", manager)).status).toBe(403);
    expect((await get("/api/admin/teams", engineer)).status).toBe(403);
    expect((await get("/api/manager/engineers", manager)).status).toBe(200);
    expect((await get("/api/manager/engineers", admin)).status).toBe(403);
    expect((await get("/api/me/enrollment", engineer)).status).toBe(200);
    expect((await get("/api/me/enrollment", manager)).status).toBe(403);
  });
});

describe("errors", () => {
  it("returns typed business errors and validation messages", async () => {
    const admin = await signIn("admin");
    const self = await patch(`/api/admin/users/${fx.id("admin")}`, admin, {
      role: "manager",
      status: "active",
      teamId: "",
      startDate: "",
    });
    expect(self.status).toBe(422);
    expect(apiErrorBody.parse(self.body).code).toBe("SELF_ACCESS_CHANGE");

    const invalid = await patch(`/api/admin/users/${fx.id("eng")}`, admin, {
      role: "owner",
      status: "active",
    });
    expect(invalid.status).toBe(400);
    const error = apiErrorBody.parse(invalid.body);
    expect(error.code).toBe("VALIDATION");
    expect(error.fields).toHaveProperty("role");

    expect((await get("/api/admin/users/not-a-route", admin)).status).toBe(404);
  });

  it("never returns internal error details", async () => {
    const admin = await signIn("admin");
    const unknownUser = await patch("/api/admin/users/00000000-0000-4000-8000-000000000000", admin, {
      role: "engineer",
      status: "active",
      teamId: "",
      startDate: "",
    });
    expect(unknownUser.status).toBe(404);
    expect(unknownUser.body).toEqual({ code: "NOT_FOUND", message: "Not found." });
  });
});
