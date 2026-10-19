import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { CSRF_HEADER } from "@portal/contracts";
import { DomainError } from "./domain-error.js";
import { ENV } from "../config/config.module.js";
import { type Env } from "../config/env.js";
import type { Request } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for every state-changing request (docs: CLAUDE.md "Architecture rules"):
 * 1. the custom header `x-portal-request: 1`, which another site can't send without CORS (we have none);
 * 2. an `Origin` equal to the portal's own origin.
 * The session cookie is also SameSite=Lax. Together these block cross-site form posts and fetches.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;
    const headerOk = request.get(CSRF_HEADER) === "1";
    const originOk = request.get("origin") === this.env.PORTAL_ORIGIN;
    if (!headerOk || !originOk) throw new DomainError("CSRF_REJECTED");
    return true;
  }
}
