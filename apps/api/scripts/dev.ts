/**
 * `pnpm dev` for the API: generate the Prisma client, compile once, then keep `tsc --watch` running
 * and restart the API and the worker whenever compiled output changes. tsc (not esbuild/tsx) compiles
 * because NestJS dependency injection needs decorator metadata. Ctrl+C stops everything.
 */
import { type ChildProcess, spawn, spawnSync } from "node:child_process";

const BIN = "node_modules/.bin";
const run = (command: string, args: string[]) => spawnSync(command, args, { stdio: "inherit" }).status === 0;

if (!run(`${BIN}/prisma`, ["generate"]) || !run(`${BIN}/tsc`, ["-p", "tsconfig.build.json"])) process.exit(1);

const children: ChildProcess[] = [
  spawn(`${BIN}/tsc`, ["-p", "tsconfig.build.json", "--watch", "--preserveWatchOutput"], {
    stdio: "inherit",
  }),
  ...["dist/main.js", "dist/worker.js"].map((entry) =>
    spawn(process.execPath, ["--watch-path=dist", "--enable-source-maps", entry], { stdio: "inherit" }),
  ),
];

function stop(): void {
  for (const child of children) child.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children) {
  child.on("exit", (code) => {
    if (code !== null && code !== 0) stop();
  });
}
