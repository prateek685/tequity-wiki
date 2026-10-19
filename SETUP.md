# Local setup (for developers)

How to run Tequity.wiki on your own machine to work on it. To put it on a server, see [DEPLOY.md](DEPLOY.md).

## What runs where

```
Browser ─► web  (Vite, :4100) ──/api──► API (NestJS, :4101) ─► PostgreSQL 18 (:4132)
                                          │ enqueue
                                          ▼
                                       Redis (:4179) ◄── worker (:4102)
```

Postgres and Redis run in Docker. The web app, API and worker run on your machine with `pnpm dev`.
Ports are deliberately unusual (the 41xx block) so they don't clash with your other projects.

## 1. Install the tools (once)

| Tool                    | Version                | Check                    |
| ----------------------- | ---------------------- | ------------------------ |
| Node.js                 | **24.21.0** (via nvm)  | `node --version`         |
| pnpm                    | 10.34.6 (via Corepack) | `pnpm --version`         |
| Docker + Compose plugin | any recent             | `docker compose version` |

```bash
nvm install 24.21.0 && nvm use     # reads .nvmrc; your default Node stays as it is
corepack enable                    # makes the right pnpm version available
pnpm install
```

## 2. Create the three `.env` files

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Generate secrets (never reuse real ones, never commit `.env` files):

```bash
openssl rand -hex 24       # for POSTGRES_PASSWORD and APP_DB_PASSWORD (letters and digits only)
openssl rand -base64 32    # for COOKIE_SECRET
```

Fill in:

| File            | Setting                         | Value                                                                                       |
| --------------- | ------------------------------- | ------------------------------------------------------------------------------------------- |
| `.env`          | `POSTGRES_PASSWORD`             | A generated password                                                                        |
| `apps/api/.env` | `DATABASE_URL`                  | `postgresql://app_user:<APP_DB_PASSWORD>@127.0.0.1:4132/portal`                             |
| `apps/api/.env` | `DIRECT_URL`                    | `postgresql://postgres:<POSTGRES_PASSWORD>@127.0.0.1:4132/portal` (same password as `.env`) |
| `apps/api/.env` | `APP_DB_PASSWORD`               | A generated password (the same one used in `DATABASE_URL`)                                  |
| `apps/api/.env` | `COOKIE_SECRET`                 | A generated secret, 32+ characters                                                          |
| `apps/api/.env` | `ALLOWED_EMAIL_DOMAIN`          | Your company email domain                                                                   |
| `apps/api/.env` | `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Your own admin login for local work (password 12+ characters)                               |

Leave `ANTHROPIC_API_KEY`, `RESEND_API_KEY` and `EMAIL_FROM` empty: locally, a fake scorer gives
made-up scores and emails are only logged. Every variable is explained in `apps/api/.env.example`, and
the API refuses to start with a clear message if one is missing or malformed.

## 3. Start the database and set it up

```bash
docker compose up -d      # PostgreSQL 18 on 127.0.0.1:4132, Redis 8 on 127.0.0.1:4179
pnpm db:migrate           # tables, the restricted app role, and your admin (from ADMIN_EMAIL/ADMIN_PASSWORD)
pnpm content:import       # the course: 65 days, ~800 questions, library
```

All three are safe to run again. `pnpm db:migrate` only adds new migrations; it never resets data.

## 4. Run the app

```bash
pnpm dev                  # web :4100, API :4101, worker :4102, with live reload
```

Open <http://localhost:4100>.

## 5. Signing in locally

- **Admin:** open <http://localhost:4100/admin-login> and use `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
- **Engineers and managers sign in with Google**, like everyone else. To do that locally, create a Google
  OAuth client (type **Internal**), set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and
  `ALLOWED_EMAIL_DOMAIN` in `apps/api/.env`, and register this redirect URI:
  `http://localhost:4100/api/auth/google/callback`. Then sign in, and approve yourself and give a role in
  Admin > Users and roles.
- There is **no test-login page**. Automated tests sign in through the API route `/api/auth/dev-login` for
  `@test.local` accounts (only when `DEV_LOGIN_ENABLED=true` and not in production).

### Demo data (optional)

`pnpm db:seed` creates demo teams and `@test.local` users. `pnpm db:seed:demo` (with `pnpm dev` running)
adds three engineers with weeks of history so the manager screens have something to show. Both refuse to
touch a non-local database. These users can't sign in through the UI; the automated tests use them.

## Everyday commands

| Command                                      | What it does                                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm dev`                                   | Web, API and worker with live reload                                               |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` | Quick checks (run after each change; 0 warnings allowed)                           |
| `pnpm format:check` / `pnpm format`          | Check / fix code formatting                                                        |
| `pnpm test:db`                               | Integration tests against the local Postgres and Redis (privacy rules, API, jobs)  |
| `pnpm test:e2e`                              | Browser tests (desktop and a phone size); needs the demo users from `pnpm db:seed` |
| `pnpm build`                                 | Build everything                                                                   |
| `pnpm content:check`                         | Validate the lesson and question files in `content/` against the PDF text          |
| `pnpm content:import`                        | Load `content/` into the database (everything imported is live)                    |
| `pnpm db:migrate:dev`                        | Create a new migration after changing `apps/api/prisma/schema.prisma`              |
| `pnpm admin:set-password you@company.com`    | Create an admin or reset an admin password (hidden prompt)                         |
| `pnpm db:studio`                             | Prisma Studio on :4155                                                             |

Before you finish a larger change, run all of: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`,
`pnpm test:e2e`, `pnpm build`, `pnpm format:check`.

## Project layout

| Folder               | What                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------- |
| `apps/web`           | React 19 + Vite app. UI only; no secrets                                              |
| `apps/api`           | NestJS API (`src/main.ts`) and worker (`src/worker.ts`), Prisma schema and migrations |
| `packages/contracts` | zod schemas for every API request and response, shared by web and API                 |
| `packages/content`   | Loader and checks for the curriculum files in `content/`                              |
| `content/`           | Lessons, mock-call cards, library and quiz questions as YAML                          |
| `infra/`             | Dockerfiles and Caddy config used by `docker-compose.prod.yml`                        |

Rules for contributors (privacy, UI tokens, versions): [CLAUDE.md](CLAUDE.md). Product decisions:
[docs/PORTAL_PLAN.md](docs/PORTAL_PLAN.md). Current status: [docs/CONTEXT.md](docs/CONTEXT.md).

## Troubleshooting

| Problem                                          | What to do                                                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `engine-strict` or Node version error on install | `nvm use` (needs 24.21.0).                                                                                               |
| API exits with "Invalid environment"             | The message lists each bad variable. Fix it in `apps/api/.env`.                                                          |
| `pnpm db:migrate` can't connect                  | `docker compose up -d`, and check `DIRECT_URL` uses `POSTGRES_PASSWORD` from `.env` and port 4132.                       |
| A port is already in use                         | Stop the other process, or run `lsof -iTCP:4100 -sTCP:LISTEN` to find it. Don't change the 41xx ports.                   |
| Admin login says "Wrong email or password"       | Set `ADMIN_EMAIL`/`ADMIN_PASSWORD` in `apps/api/.env`, then run `pnpm db:migrate`; or `pnpm admin:set-password <email>`. |
| Written answers stay "Being scored"              | Is the worker running (`pnpm dev` starts it)? Locally the fake scorer needs no key.                                      |
