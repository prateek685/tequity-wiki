import { Module } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import { EMAIL_CLIENT, type EmailClient } from "./email-client.js";
import { FakeEmailClient } from "./fake-email-client.js";
import { ResendEmailClient } from "./resend-email-client.js";
import { ENV } from "../config/config.module.js";
import { type Env } from "../config/env.js";

export type EmailMode = "resend" | "fake" | "off";
type EmailEnv = Pick<Env, "NODE_ENV" | "RESEND_API_KEY" | "EMAIL_FROM">;

/**
 * Which email client the worker uses: Resend when a key and a sender are set; the fake outside
 * production otherwise; none in production without them (items stay pending, nothing pretends to send).
 */
export function emailMode(env: EmailEnv): EmailMode {
  if (env.RESEND_API_KEY && env.EMAIL_FROM) return "resend";
  return env.NODE_ENV === "production" ? "off" : "fake";
}

export function createEmailClient(env: EmailEnv, logger?: PinoLogger): EmailClient | null {
  switch (emailMode(env)) {
    case "resend":
      return new ResendEmailClient(env.RESEND_API_KEY, env.EMAIL_FROM);
    case "fake":
      logger?.setContext(FakeEmailClient.name);
      return new FakeEmailClient(logger);
    case "off":
      return null;
  }
}

@Module({
  providers: [
    {
      provide: EMAIL_CLIENT,
      inject: [ENV, PinoLogger],
      useFactory: (env: Env, logger: PinoLogger) => createEmailClient(env, logger),
    },
  ],
  exports: [EMAIL_CLIENT],
})
export class EmailModule {}
