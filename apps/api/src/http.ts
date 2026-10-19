import cookieParser from "cookie-parser";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import { ENV } from "./config/config.module.js";
import { type Env } from "./config/env.js";
import type { NestExpressApplication } from "@nestjs/platform-express";

/**
 * HTTP set-up shared by main.ts and the API tests, so tests exercise the real configuration.
 * Caddy sets the same security headers for the whole site; helmet repeats them on API responses.
 */
export function configureHttp(app: NestExpressApplication): Env {
  const env = app.get<Env>(ENV);
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix("api");
  app.set("trust proxy", env.TRUST_PROXY);
  app.disable("x-powered-by");
  app.use(
    helmet({
      // The API returns JSON only: nothing may load or frame it.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      frameguard: { action: "deny" },
      crossOriginResourcePolicy: { policy: "same-origin" },
      strictTransportSecurity: { maxAge: 63_072_000, includeSubDomains: true },
    }),
  );
  app.use(cookieParser(env.COOKIE_SECRET));
  app.enableShutdownHooks();
  return env;
}
