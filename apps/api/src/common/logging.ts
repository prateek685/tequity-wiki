import { randomUUID } from "node:crypto";
import { type DynamicModule } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { ENV } from "../config/config.module.js";
import { type Env } from "../config/env.js";
import type { IncomingMessage } from "node:http";

const REQUEST_ID = /^[\w-]{8,64}$/;

/**
 * Structured JSON logs with a request id on every line. Never log answer text, journal entries,
 * prompts, cookies, secrets or anything that could contain PHI (docs/PORTAL_PLAN.md §8a).
 */
export function loggingModule(app: "api" | "worker"): DynamicModule {
  return LoggerModule.forRootAsync({
    inject: [ENV],
    useFactory: (env: Env) => ({
      pinoHttp: {
        level: env.LOG_LEVEL,
        base: { app: `client-ready-${app}` },
        genReqId: (request: IncomingMessage) => {
          const incoming = request.headers["x-request-id"];
          return typeof incoming === "string" && REQUEST_ID.test(incoming) ? incoming : randomUUID();
        },
        serializers: {
          req: (request: { id: string; method: string; url: string }) => ({
            id: request.id,
            method: request.method,
            url: request.url.split("?")[0],
          }),
          res: (response: { statusCode: number }) => ({ statusCode: response.statusCode }),
        },
        redact: { paths: ["*.email", "*.password", "*.token", "*.secret", "*.cookie"], censor: "[redacted]" },
        autoLogging: { ignore: (request: IncomingMessage) => (request.url ?? "").endsWith("/health") },
      },
    }),
  });
}
