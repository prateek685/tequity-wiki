import { type z } from "zod";

/**
 * Parse a response with its contract schema before it leaves the API. Catches drift between the
 * database and @portal/contracts, and strips any field the contract doesn't list (so nothing private
 * leaks by accident). Responses are small; the cost is negligible.
 */
export function asContract<S extends z.ZodType>(schema: S, value: z.input<S>): z.output<S> {
  return schema.parse(value);
}
