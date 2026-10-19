import { type ConnectionOptions } from "bullmq";

/**
 * Queue and job names (architecture v2 "Background jobs"). maintenance: the heartbeat and the scoring
 * sweep, the hourly red-flag run · scoring: one job per AI score (rate limited) · email: one job per manager
 * with pending email items.
 */
export const QUEUE = { maintenance: "maintenance", scoring: "scoring", email: "email" } as const;
export const JOB = {
  heartbeat: "heartbeat",
  scoringSweep: "scoring-sweep",
  score: "score",
  redFlags: "red-flags",
  sendEmail: "send-email",
} as const;

/** BullMQ connection from REDIS_URL (redis:// or rediss:// for TLS). */
export function redisConnection(url: string): ConnectionOptions {
  const parsed = new URL(url);
  const db = parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0;
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
  };
}
