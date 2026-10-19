# Tequity.wiki — instructions for Claude

Company-wide hub for employee-made courses; the first course is the "Client-Ready 90 days plan" (from the PDF curriculum). 30–100 users; roles engineer / manager / admin.
**New session? Read `docs/CONTEXT.md` first** (status, decisions, how the user works, next steps). Product rules: `docs/PORTAL_PLAN.md` (read the relevant section first; if code and plan disagree, ask). Setup: `README.md`.

**Stack:** pnpm 10.34.6 + Turborepo, Node 24.21.0 (`nvm use`) · `apps/web` React 19 + Vite 8, TanStack Router/Query, Tailwind 4, shadcn/ui (Radix), Inter · `apps/api` NestJS 12 (ESM, `.js` imports), Prisma 7.10.0 + Postgres 18, BullMQ 6 + Redis 8 (`worker.ts`), Google OIDC + Postgres sessions · `packages/contracts` zod schemas shared by web and api · `content/` YAML lessons and questions (written once from the PDF) · LLM (scoring only): Vercel AI SDK + Anthropic (Claude Haiku 5.5) behind `LlmClient`.

## Commands

`docker compose up -d` · `pnpm dev` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:db` (needs Postgres + Redis) · `pnpm test:e2e` · `pnpm build` · `pnpm db:migrate` · `pnpm db:seed` · `pnpm content:check` · `pnpm content:import`

Fast checks after each change: lint, typecheck, test. At the end of a milestone: also test:db, test:e2e, build, format:check.

## Ports

web 4100 · api 4101 · worker 4102 · Postgres 4132 · Redis 4179 · Prisma Studio 4155. Never use default ports (other projects use 5432/6379/3001/5000/5050).

## Version traps

Exact pins; never `pnpm add` without a version. Prisma stays 7.10.0 (`latest` is an 8 RC). TypeScript stays 6.0.3 (typescript-eslint needs <6.1). No `nestjs-zod` (no NestJS 12 support); use our `ZodValidationPipe`. BullMQ 6 has no `queue.client`.

## Privacy and data

- Only the API and worker touch the database. Authorization lives in the API (`AuthGuard`, `@Roles()`) and in Postgres RLS; web guards are UX only.
- User queries run in `withUser(userId, …)`. The app connects as `app_user` (no BYPASSRLS), never `postgres`.
- New tables: RLS enabled + FORCE, policies and grants in hand-written migration SQL. Tables with personal or private data also get privacy tests.
- Raw SQL only via tagged `$queryRaw`. Validate with zod at boundaries. Never log answer text or secrets.
- Background work: save as `pending` in Postgres, then enqueue with a deterministic `jobId`.
- External services (Anthropic, Resend, Google) sit behind interfaces with fakes; the real ones turn on when keys are in `apps/api/.env`.

## UI

Calm enterprise look (plan §8b): neutral greys, orange accent, green only for Done/Passed, Inter, `tabular-nums`. Tokens from `globals.css` only: no hex, no arbitrary Tailwind values, no `style={{}}` (ESLint enforces). Build from `components/ui`; variants via `cva`. Works at 390px, WCAG AA, with loading/empty/error states.

## Safety and workflow

- Never print or commit secrets. No git commits unless asked.
- Never run `prisma migrate reset`, drop data, or delete Docker volumes/containers, `legacy-next/` or the Supabase container without asking. Schema changes go in a new migration.
- Work fast: sensible defaults, short updates, keep config plain.
- Deployment is host-agnostic: `DEPLOY.md`, `.env.production.example`, `docker-compose.prod.yml`, `deploy.sh` (any server with Docker). Keep them in sync when env variables, ports or scripts change.
- Still undecided (the deployer picks): the host, and where nightly backups are copied.
