# Deploying Tequity.wiki

This guide takes you from an empty server to a running site. Setup is one config file and one command:
you fill in `.env.production`, then run `./deploy.sh`. Nothing else needs installing except Docker.

## What you get

One Docker Compose stack, started and updated by `./deploy.sh`:

| Part       | What it does                                                                    | Reachable from outside |
| ---------- | ------------------------------------------------------------------------------- | ---------------------- |
| `web`      | Caddy: serves the site, forwards `/api` to the API, gets the HTTPS certificate  | Yes (ports 80, 443)    |
| `api`      | The application server                                                          | No                     |
| `worker`   | Background jobs: AI scoring of written answers, manager emails                  | No                     |
| `postgres` | The database (PostgreSQL 18); data lives in a Docker volume                     | No                     |
| `redis`    | The job queue                                                                   | No                     |
| `migrate`  | Runs once per deploy: creates/updates the database, first admin, course content | No                     |

It runs on **any machine that runs Docker**: a Linux VM at any cloud provider (AWS EC2, Azure, Google
Cloud, DigitalOcean, Hetzner, ...) or a company server. It is sized for 30 to 100 users: **2 CPU,
4 GB RAM, 20 GB disk** is plenty. It does not run on platforms that only take a single container
(Heroku-style). If your platform is one of those, use a plain VM instead.

## Before you start: what you need

1. **A Linux server** with Docker Engine and the Compose plugin
   ([install Docker](https://docs.docker.com/engine/install/)). Check: `docker compose version`.
2. **A domain name** for the site, e.g. `wiki.company.com`, with a DNS `A` record pointing to the server's
   public IP. Ports **80 and 443 must be open** (cloud firewall / security group). The HTTPS
   certificate is obtained automatically.
3. **A Google sign-in client** (everyone signs in with their company Google account):
   1. Google Cloud console, **APIs & Services, Credentials, Create credentials, OAuth client ID**.
   2. Application type **Web application**. User type **Internal** (set on the OAuth consent screen).
   3. Under **Authorized redirect URIs** add `https://wiki.company.com/api/auth/google/callback`
      (your real address, ending in `/api/auth/google/callback`).
   4. Copy the **Client ID** and **Client secret**.
4. Optional, can be added later:
   - An **Anthropic API key** (AI feedback on written answers). Without it, answers show "Being scored".
   - A **Resend API key and a verified sender domain** (red-flag emails to managers). Without it, no emails.

## Deploy

```bash
git clone https://github.com/prateek685/tequity-wiki.git
cd tequity-wiki

./deploy.sh init          # creates .env.production and generates the secrets for you
nano .env.production      # fill in the values marked REQUIRED (see the table below)
./deploy.sh               # builds, starts and waits until the site is healthy
```

The first run builds the images and takes a few minutes. When it finishes it prints the address.
Open `https://wiki.company.com/admin-login` and sign in with the admin email and password you set.

### What to put in `.env.production`

`./deploy.sh init` already generated `POSTGRES_PASSWORD`, `APP_DB_PASSWORD` and `COOKIE_SECRET`. You fill in:

| Setting                                    | Value                                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `PORTAL_ORIGIN`                            | `https://wiki.company.com` (https, no trailing slash)                                           |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | From step 3 above                                                                               |
| `ALLOWED_EMAIL_DOMAIN`                     | `company.com`: only this domain can sign in                                                     |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`            | The first admin (password 12+ characters). Or use `INITIAL_ADMIN_EMAILS` for Google-only admins |
| `ANTHROPIC_API_KEY`                        | Optional (AI scoring)                                                                           |
| `RESEND_API_KEY`, `EMAIL_FROM`             | Optional (manager emails), e.g. `EMAIL_FROM="Tequity.wiki <wiki@company.com>"`                  |

Rules: no spaces around `=`; put double quotes around a value that has spaces or `<` `>`.
`./deploy.sh` checks the file before it starts anything and tells you exactly what is missing or wrong.

### The first admin

- With `ADMIN_EMAIL` and `ADMIN_PASSWORD` set, the first deploy creates that admin. It sets the password
  **only if the admin has none yet**, so later deploys never overwrite a password they changed.
- Sign in at `/admin-login`. Then **delete `ADMIN_PASSWORD` from `.env.production`** (it is only needed once).
- From then on, admins add people and give roles in the app (Admin > Users and roles). New people appear
  as "pending" after their first Google sign-in, and an admin approves them. Admins can change their own
  password in Admin > Settings.
- Forgot the admin password: `docker compose --env-file .env.production -f docker-compose.prod.yml run --rm migrate pnpm admin:set-password you@company.com`
  (asks for a new password at a hidden prompt).

## Everyday commands

```bash
./deploy.sh status            # what is running
./deploy.sh logs              # follow all logs (or: ./deploy.sh logs api)
./deploy.sh backup            # database backup to backups/portal-<date>.sql.gz
./deploy.sh stop              # stop the site; data is kept
```

### Update to a new version

```bash
git pull
./deploy.sh
```

It rebuilds, applies new database migrations, re-imports the course content (safe to repeat: unchanged
lessons and questions stay as they are) and restarts. Active sessions survive.

### Backups and restore

Back up regularly. A nightly backup with cron (`crontab -e`):

```
0 2 * * * cd /opt/tequity-wiki && ./deploy.sh backup && find backups -name '*.sql.gz' -mtime +14 -delete
```

Copy the `backups/` folder somewhere off the server too (object storage, another machine).
To restore into a fresh deployment:

```bash
gunzip -c backups/portal-YYYYMMDD-HHMMSS.sql.gz | docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres psql -U postgres -d portal
```

## Troubleshooting

| Problem                                                      | What to do                                                                                                                 |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `./deploy.sh` says a value is empty or wrong                 | Fix that line in `.env.production` and run it again.                                                                       |
| Site not reachable / no HTTPS                                | Check the DNS record points to this server and ports 80 and 443 are open. `./deploy.sh logs web` shows certificate errors. |
| Google says "redirect_uri_mismatch"                          | The redirect URI in Google must be exactly `<PORTAL_ORIGIN>/api/auth/google/callback`.                                     |
| Google says "access blocked" or only some people can sign in | Make sure the OAuth user type is **Internal** and the person's email ends with `ALLOWED_EMAIL_DOMAIN`.                     |
| The setup step failed                                        | `./deploy.sh` prints its log. Usually a wrong value in `.env.production`.                                                  |
| Changed `POSTGRES_PASSWORD` after the first deploy           | The database keeps the first password. Set the value back; changing it later needs a database reset (ask a developer).     |
| Written answers stay "Being scored"                          | `ANTHROPIC_API_KEY` is empty or invalid. Add it and run `./deploy.sh`.                                                     |
| No manager emails                                            | `RESEND_API_KEY` and `EMAIL_FROM` must both be set, with the sender domain verified in Resend.                             |

## Good to know

- **Behind a company load balancer that already provides HTTPS:** set `PORTAL_DOMAIN=:80` in `.env.production`
  (plain HTTP inside, HTTPS outside), keep `PORTAL_ORIGIN=https://...`, and point the load balancer at port 80.
- **No domain yet / quick test by IP address:** use `PORTAL_ORIGIN=http://<server-ip>`. The site loads, but Google
  sign-in only accepts `https://` addresses (or `localhost`), so only the email-and-password admin login works.
- **Data** lives in Docker volumes (`postgres-data`, `redis-data`, `caddy-data`). `./deploy.sh stop` and
  updates keep them. Do not run `docker compose down -v` unless you want to erase everything.
- **Secrets:** `.env.production` is not committed to git. Keep it private and back it up somewhere safe.
- **Local development** (for developers, not for deployment) is described in `README.md`.
