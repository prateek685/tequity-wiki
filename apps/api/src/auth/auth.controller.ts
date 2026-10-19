import { Controller, Get, HttpCode, Inject, Post, Query, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  homePathFor,
  type Me,
  safeRedirectPath,
  type SignInError,
  type SignInOptions,
} from "@portal/contracts";
import { PinoLogger } from "nestjs-pino";
import {
  clearOauthCookie,
  clearSessionCookie,
  OAUTH_COOKIE,
  setOauthCookie,
  setSessionCookie,
} from "./cookies.js";
import { AllowPending, type AuthenticatedRequest, CurrentUser, Public } from "./decorators.js";
import { GoogleService, oauthState } from "./google.service.js";
import { LoginService } from "./login.service.js";
import { SessionsService } from "./sessions.service.js";
import { ENV } from "../config/config.module.js";
import { type Env } from "../config/env.js";
import { isAllowedEmail } from "../rules/email.js";
import type { Request, Response } from "express";

/** A signed cookie value is a string only if its signature is valid; anything else is ignored. */
function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

/** Sign-in attempts per IP per minute (Google start + callback, dev login). */
export const SIGN_IN_LIMIT = { default: { limit: 20, ttl: 60_000 } };

@Controller()
export class AuthController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly google: GoogleService,
    private readonly login: LoginService,
    private readonly sessions: SessionsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuthController.name);
  }

  @Public()
  @Get("auth/options")
  options(): SignInOptions {
    return {
      google: this.google.configured,
      emailDomain: this.env.ALLOWED_EMAIL_DOMAIN,
    };
  }

  @Public()
  @Throttle(SIGN_IN_LIMIT)
  @Get("auth/google")
  async startGoogle(@Query("next") next: unknown, @Res() response: Response): Promise<void> {
    if (!this.google.configured) {
      this.failSignIn(response, "Configuration");
      return;
    }
    const { url, state } = await this.google.start(safeRedirectPath(next, this.env.PORTAL_ORIGIN));
    setOauthCookie(response, this.env, JSON.stringify(state));
    response.redirect(302, url.toString());
  }

  @Public()
  @Throttle(SIGN_IN_LIMIT)
  @Get("auth/google/callback")
  async googleCallback(@Req() request: Request, @Res() response: Response): Promise<void> {
    const raw = (request.signedCookies as Record<string, unknown>)[OAUTH_COOKIE];
    clearOauthCookie(response, this.env);
    const saved = oauthState.safeParse(parseJson(raw));
    if (!saved.success) {
      this.failSignIn(response, "AccessDenied", "missing or invalid sign-in state");
      return;
    }

    let identity;
    try {
      identity = await this.google.finish(
        new URL(request.originalUrl, "http://internal").searchParams,
        saved.data,
      );
    } catch (error) {
      this.logger.warn({ err: error }, "sign-in rejected: Google response failed verification");
      this.failSignIn(response, "AccessDenied");
      return;
    }
    if (!identity.emailVerified || !isAllowedEmail(identity.email, this.env.ALLOWED_EMAIL_DOMAIN)) {
      this.failSignIn(response, "AccessDenied", "email not verified or not on the company domain");
      return;
    }

    const result = await this.login.upsertLoginUser({
      email: identity.email,
      name: identity.name,
      googleSub: identity.sub,
    });
    if (!result.ok) {
      this.failSignIn(response, "AccessDenied", "Google account differs from the stored one");
      return;
    }
    if (result.user.status === "disabled") {
      this.failSignIn(response, "AccessDenied", "account disabled");
      return;
    }

    setSessionCookie(response, this.env, await this.sessions.create(result.user.id));
    const home = homePathFor(result.user);
    const next = result.user.status === "active" && saved.data.next !== "/" ? saved.data.next : home;
    response.redirect(302, next);
  }

  @AllowPending()
  @Get("me")
  me(@CurrentUser() user: Me): Me {
    return user;
  }

  @AllowPending()
  @Post("auth/logout")
  @HttpCode(204)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    if (request.sessionToken) await this.sessions.destroy(request.sessionToken);
    clearSessionCookie(response, this.env);
  }

  private failSignIn(response: Response, error: SignInError, reason?: string): void {
    if (reason) this.logger.warn({ reason }, "sign-in rejected");
    response.redirect(302, `/sign-in?error=${error}`);
  }
}
