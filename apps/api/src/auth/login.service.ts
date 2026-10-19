import { Injectable } from "@nestjs/common";
import { type Role, type Status } from "@portal/contracts";
import { PrismaService } from "../prisma/prisma.service.js";

interface LoginRow {
  id: string;
  role: Role | null;
  status: Status;
}

/** Outcome of a sign-in attempt, decided by the database. */
export type LoginResult = { ok: true; user: LoginRow } | { ok: false; reason: "account_mismatch" };

@Injectable()
export class LoginService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create the user on first sign-in (pending, or admin if listed in app.bootstrap_admin_emails),
   * or refresh last_login_at. Disabled users come back unchanged so the caller can refuse them.
   */
  async upsertLoginUser(input: {
    email: string;
    name: string;
    googleSub: string | null;
  }): Promise<LoginResult> {
    try {
      const rows = await this.prisma.system.$queryRaw<LoginRow[]>`
        SELECT id, role::text AS role, status::text AS status
        FROM app.upsert_login_user(${input.email}, ${input.name}, ${input.googleSub})`;
      const row = rows[0];
      if (!row) throw new Error("upsertLoginUser returned no row");
      return { ok: true, user: row };
    } catch (error) {
      if (error instanceof Error && error.message.includes("ACCOUNT_MISMATCH")) {
        return { ok: false, reason: "account_mismatch" };
      }
      throw error;
    }
  }
}
