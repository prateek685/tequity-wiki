import { Body, Controller, HttpCode, Inject, Post, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  type DevLoginRequest,
  devLoginRequest,
  homePathFor,
  type SignInResponse,
  TEST_EMAIL_DOMAIN,
} from "@portal/contracts";
import { SIGN_IN_LIMIT } from "./auth.controller.js";
import { setSessionCookie } from "./cookies.js";
import { Public } from "./decorators.js";
import { LoginService } from "./login.service.js";
import { SessionsService } from "./sessions.service.js";
import { DomainError } from "../common/domain-error.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { ENV } from "../config/config.module.js";
import { type Env } from "../config/env.js";
import { isAllowedEmail } from "../rules/email.js";
import type { Response } from "express";

/**
 * Local-only "sign in as test user". AuthModule registers this controller only when
 * NODE_ENV !== "production" and DEV_LOGIN_ENABLED=true, so in production the route doesn't exist (404).
 */
@Controller("auth/dev-login")
export class DevLoginController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly login: LoginService,
    private readonly sessions: SessionsService,
  ) {}

  @Public()
  @Throttle(SIGN_IN_LIMIT)
  @Post()
  @HttpCode(200)
  async signIn(
    @Body(new ZodValidationPipe(devLoginRequest)) body: DevLoginRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SignInResponse> {
    const email = body.email.toLowerCase();
    // Test accounts only: real company accounts always sign in with Google.
    if (!isAllowedEmail(email, TEST_EMAIL_DOMAIN)) throw new DomainError("FORBIDDEN");
    const result = await this.login.upsertLoginUser({ email, name: email, googleSub: null });
    if (!result.ok || result.user.status === "disabled") throw new DomainError("FORBIDDEN");
    setSessionCookie(response, this.env, await this.sessions.create(result.user.id));
    return { next: homePathFor(result.user) };
  }
}
