import { SESSION_LIFETIME_DAYS } from "./sessions.service.js";
import { type Env } from "../config/env.js";
import type { CookieOptions, Response } from "express";

export const SESSION_COOKIE = "cr_session";
/** Short-lived, signed: holds the PKCE verifier, state, nonce and return path during Google sign-in. */
export const OAUTH_COOKIE = "cr_oauth";
const OAUTH_COOKIE_MINUTES = 10;

function base(env: Env): CookieOptions {
  return {
    httpOnly: true,
    secure: env.PORTAL_ORIGIN.startsWith("https://"),
    sameSite: "lax",
  };
}

export function setSessionCookie(response: Response, env: Env, token: string): void {
  response.cookie(SESSION_COOKIE, token, {
    ...base(env),
    path: "/",
    maxAge: SESSION_LIFETIME_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(response: Response, env: Env): void {
  response.clearCookie(SESSION_COOKIE, { ...base(env), path: "/" });
}

export function setOauthCookie(response: Response, env: Env, value: string): void {
  response.cookie(OAUTH_COOKIE, value, {
    ...base(env),
    path: "/api/auth",
    signed: true,
    maxAge: OAUTH_COOKIE_MINUTES * 60 * 1000,
  });
}

export function clearOauthCookie(response: Response, env: Env): void {
  response.clearCookie(OAUTH_COOKIE, { ...base(env), path: "/api/auth", signed: true });
}
