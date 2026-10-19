import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { type Role } from "@portal/contracts";
import { SESSION_COOKIE } from "./cookies.js";
import { ALLOW_PENDING_KEY, type AuthenticatedRequest, PUBLIC_KEY, ROLES_KEY } from "./decorators.js";
import { SessionsService } from "./sessions.service.js";
import { DomainError } from "../common/domain-error.js";

/**
 * Global guard: every route needs a valid session unless marked @Public(). Role and status come from
 * the database on every request. Pending users reach only @AllowPending() routes; @Roles() limits a
 * route to active users with those roles. Row-level security checks the same rules again.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = (request.cookies as Record<string, string | undefined>)[SESSION_COOKIE];
    const user = token ? await this.sessions.lookup(token) : null;
    if (!token || !user) throw new DomainError("UNAUTHENTICATED");
    request.user = user;
    request.sessionToken = token;

    if (user.status !== "active" || user.role === null) {
      if (this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_PENDING_KEY, targets)) return true;
      throw new DomainError("FORBIDDEN");
    }

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (roles && !roles.includes(user.role)) throw new DomainError("FORBIDDEN");
    return true;
  }
}
