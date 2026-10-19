import { describe, expect, it } from "vitest";
import { devLoginAllowed, parseEnv } from "./env.js";

const base = {
  PORTAL_ORIGIN: "http://localhost:4100",
  DATABASE_URL: "postgresql://app_user:x@127.0.0.1:4132/portal",
  REDIS_URL: "redis://127.0.0.1:4179",
  ALLOWED_EMAIL_DOMAIN: "company.com",
  COOKIE_SECRET: "a".repeat(32),
};

describe("devLoginAllowed", () => {
  it("never allows the test login in production, even when the flag is on", () => {
    expect(devLoginAllowed({ NODE_ENV: "production", DEV_LOGIN_ENABLED: true })).toBe(false);
  });

  it("allows it outside production only when the flag is on", () => {
    expect(devLoginAllowed({ NODE_ENV: "development", DEV_LOGIN_ENABLED: true })).toBe(true);
    expect(devLoginAllowed({ NODE_ENV: "test", DEV_LOGIN_ENABLED: true })).toBe(true);
    expect(devLoginAllowed({ NODE_ENV: "development", DEV_LOGIN_ENABLED: false })).toBe(false);
  });
});

describe("parseEnv", () => {
  it("parses a valid environment", () => {
    const env = parseEnv({ ...base, DEV_LOGIN_ENABLED: "true", TRUST_PROXY: "1" });
    expect(env.DEV_LOGIN_ENABLED).toBe(true);
    expect(env.TRUST_PROXY).toBe(1);
    expect(env.PORTAL_ORIGIN).toBe("http://localhost:4100");
  });

  it("reads the LLM settings: an empty key and Haiku 5.5 by default, a trimmed model when set", () => {
    const defaults = parseEnv(base);
    expect(defaults.ANTHROPIC_API_KEY).toBe("");
    expect(defaults.LLM_SCORING_MODEL).toBe("claude-haiku-5-5");
    const env = parseEnv({ ...base, LLM_SCORING_MODEL: " claude-sonnet-5-5 " });
    expect(env.LLM_SCORING_MODEL).toBe("claude-sonnet-5-5");
  });

  it("refuses to start with a missing or weak setting, naming it", () => {
    expect(() => parseEnv({ ...base, COOKIE_SECRET: "short" })).toThrow(/COOKIE_SECRET/);
    expect(() => parseEnv({ ...base, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });
});
