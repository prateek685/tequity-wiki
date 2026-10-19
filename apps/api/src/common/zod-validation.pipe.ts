import { type PipeTransform } from "@nestjs/common";
import { type z } from "zod";

/** A request body, query or params object that failed its contract schema. */
export class RequestValidationError extends Error {
  constructor(
    readonly fields: Record<string, string>,
    readonly firstMessage: string,
  ) {
    super("Request validation failed");
    this.name = "RequestValidationError";
  }
}

/**
 * Validates and transforms input with a schema from @portal/contracts:
 * `@Body(new ZodValidationPipe(createTeamRequest)) body: CreateTeamRequest`.
 * (nestjs-zod doesn't support NestJS 12, so this is our own ~20-line version.)
 */
export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      fields[key] ??= issue.message;
    }
    throw new RequestValidationError(fields, result.error.issues[0]?.message ?? "Check the form.");
  }
}
