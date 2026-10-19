import { HttpException, HttpStatus } from "@nestjs/common";
import { type ApiErrorBody, type ErrorCode, ERROR_MESSAGES } from "@portal/contracts";
import { DomainError } from "./domain-error.js";
import { RequestValidationError } from "./zod-validation.pipe.js";

export interface MappedError {
  status: number;
  body: ApiErrorBody;
  /** True for unexpected errors, which are logged with the request id. */
  unexpected: boolean;
}

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  CSRF_REJECTED: HttpStatus.FORBIDDEN,
  VALIDATION: HttpStatus.BAD_REQUEST,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  SELF_ACCESS_CHANGE: HttpStatus.UNPROCESSABLE_ENTITY,
  APPROVAL_NEEDS_TEAM_AND_START: HttpStatus.UNPROCESSABLE_ENTITY,
  LAST_ADMIN: HttpStatus.UNPROCESSABLE_ENTITY,
  TEAM_MEMBER_MUST_BE_ENGINEER: HttpStatus.UNPROCESSABLE_ENTITY,
  TEAM_MANAGER_MUST_BE_MANAGER: HttpStatus.UNPROCESSABLE_ENTITY,
  NO_ENROLLMENT: HttpStatus.UNPROCESSABLE_ENTITY,
  DAY_LOCKED: HttpStatus.FORBIDDEN,
  DAY_NOT_READY: HttpStatus.UNPROCESSABLE_ENTITY,
  LESSON_NOT_IN_DAY: HttpStatus.UNPROCESSABLE_ENTITY,
  ASSESSMENT_LOCKED: HttpStatus.FORBIDDEN,
  RETAKE_NOT_YET: HttpStatus.CONFLICT,
  STEPS_NOT_DONE: HttpStatus.UNPROCESSABLE_ENTITY,
  QUIZ_NOT_READY: HttpStatus.UNPROCESSABLE_ENTITY,
  QUIZ_ALREADY_ANSWERED: HttpStatus.CONFLICT,
  NOTHING_TO_UNLOCK: HttpStatus.CONFLICT,
  CHECKIN_NOT_REACHED: HttpStatus.UNPROCESSABLE_ENTITY,
  CHECKIN_LOCKED: HttpStatus.CONFLICT,
  GATE_NOT_REACHED: HttpStatus.UNPROCESSABLE_ENTITY,
  GATE_RECORDED: HttpStatus.CONFLICT,
  OVERRIDE_NOTE_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  FINAL_NOT_REACHED: HttpStatus.UNPROCESSABLE_ENTITY,
  LIVE_CALLS_PENDING: HttpStatus.UNPROCESSABLE_ENTITY,
  INTERNAL: HttpStatus.INTERNAL_SERVER_ERROR,
};

/** Rule violations raised by database triggers (`RAISE EXCEPTION '<CODE>'`). */
const DATABASE_RULES = [
  "LAST_ADMIN",
  "TEAM_MEMBER_MUST_BE_ENGINEER",
  "TEAM_MANAGER_MUST_BE_MANAGER",
] as const;

function known(code: ErrorCode, extra?: Partial<ApiErrorBody>): MappedError {
  return {
    status: STATUS_BY_CODE[code],
    body: { code, message: ERROR_MESSAGES[code], ...extra },
    unexpected: code === "INTERNAL",
  };
}

function codeFromHttpStatus(status: number): ErrorCode {
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 400 && status < 500) return "VALIDATION";
  return "INTERNAL";
}

/**
 * Turn any thrown value into the API's error shape. Messages come from @portal/contracts, so no
 * internal detail (SQL, stack, driver text) ever reaches the client.
 */
export function toApiError(error: unknown): MappedError {
  if (error instanceof DomainError) return known(error.code);
  if (error instanceof RequestValidationError) {
    return known("VALIDATION", { message: error.firstMessage, fields: error.fields });
  }
  if (error instanceof HttpException) return known(codeFromHttpStatus(error.getStatus()));

  const text = error instanceof Error ? error.message : "";
  const rule = DATABASE_RULES.find((code) => text.includes(code));
  if (rule) return known(rule);
  // Unique violation: Prisma P2002 or Postgres 23505 surfaced by the driver adapter.
  if (text.includes("P2002") || text.includes("Unique constraint") || text.includes("23505")) {
    return known("CONFLICT");
  }
  // Prisma "record to update/delete not found".
  if (text.includes("P2025")) return known("NOT_FOUND");
  return known("INTERNAL");
}
