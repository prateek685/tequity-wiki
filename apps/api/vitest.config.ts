import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC compiles the tests so NestJS decorators keep their type metadata (dependency injection);
// Vite's default transformer doesn't emit it.
export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: "es2023",
      },
    }),
  ],
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["src/**/*.test.ts"] },
      },
      {
        // Needs the local Postgres and Redis (docker compose up -d postgres redis).
        extends: true,
        test: {
          name: "db",
          include: ["test/**/*.test.ts"],
          setupFiles: ["test/setup-env.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
