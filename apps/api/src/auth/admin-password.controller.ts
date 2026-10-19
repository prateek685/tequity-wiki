import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  type AdminPasswordStatus,
  type Me,
  type SetAdminPasswordRequest,
  setAdminPasswordRequest,
} from "@portal/contracts";
import { ADMIN_LOGIN_LIMIT } from "./admin-login.controller.js";
import { CurrentUser, Roles } from "./decorators.js";
import { hashPassword, verifyPassword } from "./password.js";
import { DomainError } from "../common/domain-error.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { PrismaService } from "../prisma/prisma.service.js";

/** A signed-in admin sets or changes their own sign-in password. */
@Controller("auth/admin-password")
@Roles("admin")
export class AdminPasswordController {
  constructor(private readonly prisma: PrismaService) {}

  private async currentHash(email: string): Promise<string | undefined> {
    const rows = await this.prisma.system.$queryRaw<{ password_hash: string }[]>`
      SELECT password_hash FROM app.admin_login_lookup(${email})`;
    return rows[0]?.password_hash;
  }

  @Get()
  async status(@CurrentUser() user: Me): Promise<AdminPasswordStatus> {
    return { hasPassword: (await this.currentHash(user.email)) !== undefined };
  }

  @Throttle(ADMIN_LOGIN_LIMIT)
  @Post()
  @HttpCode(204)
  async set(
    @CurrentUser() user: Me,
    @Body(new ZodValidationPipe(setAdminPasswordRequest)) body: SetAdminPasswordRequest,
  ): Promise<void> {
    const existing = await this.currentHash(user.email);
    // Changing a password needs the old one; the first password comes with the signed-in session.
    if (existing && !(await verifyPassword(body.currentPassword ?? "", existing))) {
      throw new DomainError("INVALID_CREDENTIALS");
    }
    const hash = await hashPassword(body.newPassword);
    await this.prisma.system.$executeRaw`SELECT app.set_admin_password(${user.id}::uuid, ${hash})`;
  }
}
