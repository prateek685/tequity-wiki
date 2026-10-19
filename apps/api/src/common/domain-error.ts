import { type ErrorCode } from "@portal/contracts";

/**
 * An expected business-rule failure. The exception filter turns it into an API error with the
 * matching user-facing message from @portal/contracts. Anything else is unexpected and is logged.
 */
export class DomainError extends Error {
  constructor(readonly code: Exclude<ErrorCode, "INTERNAL">) {
    super(code);
    this.name = "DomainError";
  }
}
