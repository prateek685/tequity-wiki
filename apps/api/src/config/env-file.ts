import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** apps/api/.env — the same path from src/config (dev, tests) and dist/config (built app). */
const ENV_FILE = fileURLToPath(new URL("../../.env", import.meta.url));

/**
 * Load apps/api/.env into process.env if it exists (Node's built-in loader). Variables already set
 * in the environment win, so CI and the hosting platform override the file. Production has no file.
 */
export function loadLocalEnv(): void {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
}
