// Prisma CLI configuration (Prisma 7). The CLI (migrate, generate) connects with the owner role
// through DIRECT_URL. The running API and worker never use this URL: they connect as the
// restricted app role through DATABASE_URL (src/prisma/prisma.service.ts).
import { defineConfig } from "prisma/config";
import { loadLocalEnv } from "./src/config/env-file.js";

loadLocalEnv();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // `prisma generate` doesn't need a database; only migrate commands read the URL.
  datasource: { url: process.env.DIRECT_URL ?? "" },
});
