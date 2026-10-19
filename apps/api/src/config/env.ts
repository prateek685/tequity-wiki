import { z } from "zod";

const flag = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

/**
 * Environment for the API and the worker, validated once at start-up so a missing or malformed
 * variable stops the process with a clear message instead of failing at the first request.
 * Names and meanings: apps/api/.env.example.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4101),
  WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(4102),
  PORTAL_ORIGIN: z.url().transform((value) => new URL(value).origin),
  TRUST_PROXY: z
    .string()
    .default("false")
    .transform((value) => (value === "false" ? false : Number(value)))
    .pipe(z.union([z.literal(false), z.number().int().min(1).max(5)])),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  ALLOWED_EMAIL_DOMAIN: z
    .string()
    .min(3)
    .transform((value) => value.trim().toLowerCase().replace(/^@/, "")),
  COOKIE_SECRET: z.string().min(32, "COOKIE_SECRET must be at least 32 characters"),
  DEV_LOGIN_ENABLED: flag,
  /** AI scoring (worker only). Empty: the fake scorer outside production; no scoring in production. */
  ANTHROPIC_API_KEY: z.string().trim().default(""),
  /** The Anthropic model that scores answers (docs/PORTAL_PLAN.md §7.1). */
  LLM_SCORING_MODEL: z.string().trim().min(1).default("claude-haiku-5-5"),
  /** Manager emails (worker only). Both set: Resend; else the fake outside production, none in production. */
  RESEND_API_KEY: z.string().trim().default(""),
  /** The sender, e.g. "Tequity.wiki <wiki@company.com>" (a domain verified in Resend). */
  EMAIL_FROM: z.string().trim().default(""),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment:\n${problems.join("\n")}`);
  }
  return result.data;
}

/** The test sign-in exists only outside production, whatever the flag says. */
export function devLoginAllowed(env: Pick<Env, "NODE_ENV" | "DEV_LOGIN_ENABLED">): boolean {
  return env.NODE_ENV !== "production" && env.DEV_LOGIN_ENABLED;
}
