import { createParamDecorator, type ExecutionContext, SetMetadata } from "@nestjs/common";
import { type Me, type Role } from "@portal/contracts";
import type { Request } from "express";

export const PUBLIC_KEY = "auth:public";
export const ALLOW_PENDING_KEY = "auth:allowPending";
export const ROLES_KEY = "auth:roles";

/** No sign-in needed (sign-in flow, health). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Signed-in users who are still waiting for approval may call this route (e.g. /api/me, logout). */
export const AllowPending = () => SetMetadata(ALLOW_PENDING_KEY, true);

/** Only active users with one of these roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** The signed-in user, attached by AuthGuard. */
export interface AuthenticatedRequest extends Request {
  user?: Me;
  sessionToken?: string;
}

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): Me => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!request.user) throw new Error("CurrentUser used on a route without AuthGuard");
  return request.user;
});
