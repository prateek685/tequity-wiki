import { createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { type Me } from "@portal/contracts";
import { PrismaService } from "../prisma/prisma.service.js";

/** Absolute session lifetime and idle timeout (architecture v2 "Login flow"). */
export const SESSION_LIFETIME_DAYS = 7;
export const SESSION_IDLE_HOURS = 12;

function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

/**
 * Server-side sessions. The cookie holds a random 32-byte token; the database stores only its hash
 * and is reached through SECURITY DEFINER functions (the app role cannot read `app.sessions`).
 */
@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates a session and returns the token for the cookie. Refused for disabled users. */
  async create(userId: string): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    const lifetime = `${SESSION_LIFETIME_DAYS} days`;
    await this.prisma.system.$executeRaw`
      SELECT app.create_session(${userId}::uuid, ${hashToken(token)}, ${lifetime}::interval)`;
    return token;
  }

  /** The user behind a token, read fresh from the database (role changes apply immediately). */
  async lookup(token: string): Promise<Me | null> {
    if (token.length === 0 || token.length > 100) return null;
    const idle = `${SESSION_IDLE_HOURS} hours`;
    const rows = await this.prisma.system.$queryRaw<Me[]>`
      SELECT id, email, name, role::text AS role, status::text AS status
      FROM app.session_user_by_token(${hashToken(token)}, ${idle}::interval)`;
    return rows[0] ?? null;
  }

  async destroy(token: string): Promise<void> {
    await this.prisma.system.$executeRaw`SELECT app.delete_session(${hashToken(token)})`;
  }
}
