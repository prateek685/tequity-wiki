// Integration tests use the local database and Redis from apps/api/.env, and refuse anything else:
// they create and delete fixtures (and briefly toggle a trigger during cleanup).
import { loadLocalEnv } from "../src/config/env-file.js";

loadLocalEnv();

if (!/@(127\.0\.0\.1|localhost):/.test(process.env.DIRECT_URL ?? "")) {
  throw new Error("Integration tests refuse to run: DIRECT_URL is not a local database.");
}
