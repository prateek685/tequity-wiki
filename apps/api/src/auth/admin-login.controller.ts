import { Body, Controller, HttpCode, Inject, Post, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  type AdminLoginRequest,
  adminLoginRequest,
  homePathFor,
  type Role,
  type SignInResponse,
  type Status,
} from "@portal/contracts";
import { setSessionCookie } from "./cookies.js";
import { Public } from "./decorators.js";
import { UNKNOWN_ACCOUNT_HASH, verifyPassword } from "./password.js";
import { SessionsService } from "./sessions.service.js";
import { DomainError } from "../common/domain-error.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { ENV } from "../config/config.module.js";
import { type Env } from "../config/env.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { Response } from "express";

/** Password attempts per IP per minute. */
export const ADMIN_LOGIN_LIMIT = { default: { limit: 10, ttl: 60_000 } };

interface AdminRow {
  id: string;
  role: Role;
  status: Status;
  password_hash: string;
}

/**
 * Email + password sign-in for admins. Available in production too. Every failure (unknown email, not
 * an admin, no password set, wrong password, disabled) returns the same error after the same work.
 */
@Controller("auth/admin-login")
export class AdminLoginController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {}

  @Public()
  @Throttle(ADMIN_LOGIN_LIMIT)
  @Post()
  @HttpCode(200)
  async signIn(
    @Body(new ZodValidationPipe(adminLoginRequest)) body: AdminLoginRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SignInResponse> {
    const rows = await this.prisma.system.$queryRaw<AdminRow[]>`
      SELECT id, role::text AS role, status::text AS status, password_hash
      FROM app.admin_login_lookup(${body.email})`;
    const admin = rows[0];
    const matches = await verifyPassword(body.password, admin?.password_hash ?? UNKNOWN_ACCOUNT_HASH);
    if (!admin || !matches || admin.status === "disabled") {
      throw new DomainError("INVALID_CREDENTIALS");
    }
    await this.prisma.system.$executeRaw`
      UPDATE users SET last_login_at = now() WHERE id = ${admin.id}::uuid`;
    setSessionCookie(response, this.env, await this.sessions.create(admin.id));
    return { next: homePathFor({ role: admin.role, status: admin.status }) };
  }
}
