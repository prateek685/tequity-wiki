# Tequity.wiki

Company-wide hub for employee-made courses. The first course is the **Client-Ready 90 days plan**: engineers work through Days 1–65, managers follow their team, admins manage people and content.

- Product plan and rules: [`docs/PORTAL_PLAN.md`](docs/PORTAL_PLAN.md)
- How we build (stack, versions, rules for contributors and Claude): [`CLAUDE.md`](CLAUDE.md)

```
Browser ─► Caddy ── /       → React app (apps/web)
                └─ /api/*  → NestJS API (apps/api) ─► PostgreSQL 18 (row-level security)
                                    │ enqueue
                                    ▼
                                 Redis ◄── worker (apps/api, BullMQ jobs + schedules)
```

| Folder               | What                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `apps/web`           | React 19 + Vite single-page app. UI only, no secrets                                             |
| `apps/api`           | NestJS API (`src/main.ts`) and worker (`src/worker.ts`), Prisma schema/migrations                |
| `packages/contracts` | zod schemas for every API request and response, shared by web and API                            |
| `packages/content`   | Schemas, loader and checks for the curriculum files in `content/` (written once from the PDF)    |
| `content/`           | Lessons, mock cards, library and quiz questions as YAML, word for word from the PDF              |
| `packages/config`    | Shared TypeScript, ESLint and Stylelint configuration                                            |
| `infra/`             | Draft Caddyfile and Dockerfiles for deployment (not used yet; finalised once hosting is decided) |

## Setup (local)

**Step-by-step guide: [SETUP.md](SETUP.md).** To deploy to a server: [DEPLOY.md](DEPLOY.md). Short version:

Needs Node **24.21.0** (via nvm), Docker, and Corepack (bundled with Node 24).

```bash
nvm install 24.21.0 && nvm use          # reads .nvmrc; your default Node stays as it is
corepack enable                          # pnpm 10.34.6 from package.json
pnpm install

cp .env.example .env                     # then set POSTGRES_PASSWORD
cp apps/api/.env.example apps/api/.env   # fill in the same passwords; DEV_LOGIN_ENABLED=true for local work
cp apps/web/.env.example apps/web/.env

docker compose up -d                     # Postgres 18 on 127.0.0.1:4132, Redis 8 on 127.0.0.1:4179
pnpm db:migrate                          # migrations + the restricted app role + first admins
pnpm db:seed                             # demo teams and users (local only)
pnpm content:import                      # lessons and questions; everything imported is live
pnpm dev                                 # web :4100, API :4101, worker :4102
```

Optional, with `pnpm dev` running: `pnpm db:seed:demo` adds three engineers with weeks of history to priya's Platform team (`kavya@`, `dev@`, `sara@test.local`) so the manager screens have something to show. It drives the real API as each of them, is safe to re-run (it resets only their activity) and refuses anything but a local database and API.

Open http://localhost:4100. Everyone signs in with Google; admins can also use **Admin sign in** (`/admin-login`, email and password). To create the first admin, see [First admin](#first-admin).

The `@test.local` demo accounts have no sign-in page. Automated tests sign in through the API route `/api/auth/dev-login` (local only, `DEV_LOGIN_ENABLED=true`).

## First admin

Admin accounts sign in with an email and password. Create one with either:

- **Variables (best for hosting):** set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12+ characters) in `apps/api/.env` or the host's environment, then run `pnpm db:migrate`. It creates the admin and sets the password the first time only; later deploys never overwrite a password the admin changed. Remove `ADMIN_PASSWORD` afterwards.
- **Prompt:** `pnpm admin:set-password you@company.com` asks for the password at a hidden prompt. Also use this to reset a forgotten password.

The password is stored only as a salted scrypt hash in a table the app role cannot read. Demoting an admin deletes their password.

Generate secrets with `openssl rand -hex 24` (passwords) and `openssl rand -base64 32` (`COOKIE_SECRET`). Never commit `.env` files or paste their values anywhere.

**Ports** (this project uses its own 41xx block): web 4100 · API 4101 · worker health 4102 · Postgres 4132 · Redis 4179 · Prisma Studio 4155.

## Commands

| Command                                                                | Does                                                                                                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                                             | Contracts watch + API + worker + Vite, with reload                                                                        |
| `pnpm lint` · `pnpm lint:css` · `pnpm format:check` · `pnpm typecheck` | Static checks (0 warnings allowed)                                                                                        |
| `pnpm test`                                                            | Unit tests                                                                                                                |
| `pnpm test:db`                                                         | Integration tests against the local Postgres and Redis: privacy (RLS), sessions, services, HTTP API, jobs                 |
| `pnpm build`                                                           | Build every package                                                                                                       |
| `pnpm test:e2e`                                                        | Playwright on desktop and a 390 px phone, against `pnpm dev` (started automatically if not running)                       |
| `pnpm db:migrate:dev`                                                  | Create a new migration (schema changes always go in a new migration)                                                      |
| `pnpm content:check`                                                   | Validate the lesson and question files in `content/` against the PDF text (`docs/pdf-text.txt`)                           |
| `pnpm content:import`                                                  | Load `content/` into the database. Everything imported is live (no review step); fix problems in `content/` and re-import |

## Google sign-in

Create an OAuth client of type **Internal** in the company Google Workspace and set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `ALLOWED_EMAIL_DOMAIN`. Register this redirect URI: `<PORTAL_ORIGIN>/api/auth/google/callback` (locally `http://localhost:4100/api/auth/google/callback`).

## Deploying

See **[DEPLOY.md](DEPLOY.md)**: any server with Docker, one config file (`.env.production`, template `.env.production.example`) and one command (`./deploy.sh`). Schema changes are always applied with `prisma migrate deploy`, which only adds new migrations and never resets data.
