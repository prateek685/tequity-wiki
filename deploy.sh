#!/usr/bin/env bash
# Deploy Tequity.wiki on any machine that runs Docker. Guide: DEPLOY.md.
#
#   ./deploy.sh init      create .env.production with generated secrets (first time only)
#   ./deploy.sh           check .env.production, build, start (or update) and wait until healthy
#   ./deploy.sh status    show what is running
#   ./deploy.sh logs [service]   follow logs (api, worker, web, postgres, redis, migrate)
#   ./deploy.sh backup    save the database to backups/portal-<date>.sql.gz
#   ./deploy.sh stop      stop the site (data is kept)
set -euo pipefail

cd "$(dirname "$0")"
ENV_FILE=".env.production"
COMPOSE_FILE="docker-compose.prod.yml"
compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

red() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*"; }
die() { red "✗ $*"; exit 1; }

# The value of KEY in .env.production (quotes removed). Never evaluates the file.
val() {
  local line
  line=$(grep -E "^$1=" "$ENV_FILE" | tail -n 1 || true)
  line=${line#*=}
  line=${line%\"}
  line=${line#\"}
  printf '%s' "$line"
}

need_docker() {
  command -v docker >/dev/null 2>&1 || die "Docker is not installed. Install Docker Engine: https://docs.docker.com/engine/install/"
  docker info >/dev/null 2>&1 || die "Docker is installed but not running (or this user may not use it). Try: sudo systemctl start docker, or add your user to the docker group."
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is missing. Install the compose plugin: https://docs.docker.com/compose/install/"
}

random_hex() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex 24; else head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'; fi
}

# Fill KEY= (empty) in .env.production with a value. Hex values are safe in sed.
fill() { sed -i.bak "s|^$1=\$|$1=$2|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"; }

cmd_init() {
  [ -f "$ENV_FILE" ] && die "$ENV_FILE already exists. Edit it, or delete it to start over."
  cp .env.production.example "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  fill POSTGRES_PASSWORD "$(random_hex)"
  fill APP_DB_PASSWORD "$(random_hex)"
  fill COOKIE_SECRET "$(random_hex)"
  green "✓ Created $ENV_FILE with generated database passwords and cookie secret."
  echo "Next: open $ENV_FILE, fill in the values marked REQUIRED (address, Google sign-in, first admin), then run ./deploy.sh"
}

check_env() {
  [ -f "$ENV_FILE" ] || die "$ENV_FILE not found. Run ./deploy.sh init first."
  local missing=()
  for key in PORTAL_ORIGIN POSTGRES_PASSWORD APP_DB_PASSWORD GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET ALLOWED_EMAIL_DOMAIN COOKIE_SECRET; do
    [ -n "$(val "$key")" ] || missing+=("$key")
  done
  if [ ${#missing[@]} -gt 0 ]; then
    red "✗ These values are empty in $ENV_FILE:"
    printf '    %s\n' "${missing[@]}" >&2
    exit 1
  fi

  local origin
  origin=$(val PORTAL_ORIGIN)
  [[ "$origin" =~ ^https?://[^/]+$ ]] || die "PORTAL_ORIGIN must look like https://wiki.company.com (no path, no trailing slash). Got: $origin"
  local cookie_secret
  cookie_secret=$(val COOKIE_SECRET)
  [ "${#cookie_secret}" -ge 32 ] || die "COOKIE_SECRET must be at least 32 characters (./deploy.sh init generates one)."
  [[ "$(val POSTGRES_PASSWORD)$(val APP_DB_PASSWORD)" =~ ^[A-Za-z0-9]+$ ]] || die "POSTGRES_PASSWORD and APP_DB_PASSWORD may contain letters and digits only."

  if [ -z "$(val ADMIN_EMAIL)$(val INITIAL_ADMIN_EMAILS)" ]; then
    die "No first admin: set ADMIN_EMAIL + ADMIN_PASSWORD (or INITIAL_ADMIN_EMAILS) in $ENV_FILE."
  fi
  local admin_password
  admin_password=$(val ADMIN_PASSWORD)
  if [ -n "$(val ADMIN_EMAIL)" ] && [ -n "$admin_password" ] && [ "${#admin_password}" -lt 12 ]; then
    die "ADMIN_PASSWORD must be at least 12 characters."
  fi
  if [ -n "$(val ADMIN_EMAIL)" ] && [ -z "$admin_password" ]; then
    warn "! ADMIN_PASSWORD is empty: fine if that admin already has a password, otherwise they can only use Google sign-in."
  fi

  [[ "$origin" == http://* ]] && warn "! PORTAL_ORIGIN uses http://. Google sign-in only accepts https:// addresses (or http://localhost)."
  [ -n "$(val ANTHROPIC_API_KEY)" ] || warn "! ANTHROPIC_API_KEY is empty: written answers will stay \"Being scored\" until a key is added."
  [ -n "$(val EMAIL_FROM)" ] || warn "! EMAIL_FROM is empty: managers will not get red-flag emails."
  true
}

# Caddy's site address: the host name (automatic HTTPS) unless PORTAL_DOMAIN says otherwise.
set_domain() {
  local origin domain
  origin=$(val PORTAL_ORIGIN)
  domain=$(val PORTAL_DOMAIN)
  if [ -z "$domain" ]; then
    if [[ "$origin" == https://* ]]; then domain=${origin#https://}; else domain=":80"; fi
  fi
  export PORTAL_DOMAIN="$domain"
}

wait_healthy() {
  local deadline=$((SECONDS + 300)) service id status
  echo "Waiting for the site to become healthy (first run builds the images: a few minutes)..."
  while [ $SECONDS -lt $deadline ]; do
    id=$(compose ps -aq migrate 2>/dev/null || true)
    if [ -n "$id" ] && [ "$(docker inspect -f '{{.State.Status}}' "$id")" = "exited" ] \
       && [ "$(docker inspect -f '{{.State.ExitCode}}' "$id")" != "0" ]; then
      red "✗ The setup step (migrations, admin, content) failed. Its log:"
      compose logs --no-color --tail 40 migrate >&2
      exit 1
    fi
    local ok=true
    for service in api worker; do
      id=$(compose ps -q "$service" 2>/dev/null || true)
      status=$([ -n "$id" ] && docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" || echo missing)
      [ "$status" = "healthy" ] || ok=false
    done
    id=$(compose ps -q web 2>/dev/null || true)
    [ -n "$id" ] && [ "$(docker inspect -f '{{.State.Status}}' "$id")" = "running" ] || ok=false
    if $ok; then return 0; fi
    sleep 3
  done
  red "✗ Not healthy after 5 minutes. Status and recent logs:"
  compose ps >&2
  compose logs --no-color --tail 30 api worker web >&2
  exit 1
}

cmd_deploy() {
  need_docker
  check_env
  set_domain
  echo "Deploying $(val PORTAL_ORIGIN) ..."
  compose up -d --build --remove-orphans
  wait_healthy
  green "✓ Tequity.wiki is running at $(val PORTAL_ORIGIN)"
  if [ -n "$(val ADMIN_PASSWORD)" ]; then
    warn "Now sign in at $(val PORTAL_ORIGIN)/admin-login, then delete ADMIN_PASSWORD from $ENV_FILE (it is only used the first time)."
  fi
}

cmd_backup() {
  need_docker
  set_domain
  mkdir -p backups
  local file="backups/portal-$(date +%Y%m%d-%H%M%S).sql.gz"
  compose exec -T postgres pg_dump -U postgres -d portal | gzip > "$file"
  green "✓ Saved $file ($(du -h "$file" | cut -f1))"
}

case "${1:-deploy}" in
  init) cmd_init ;;
  deploy) cmd_deploy ;;
  status) need_docker; set_domain; compose ps ;;
  logs) need_docker; set_domain; shift; compose logs -f --tail 100 "$@" ;;
  backup) cmd_backup ;;
  stop) need_docker; set_domain; compose stop; green "✓ Stopped. Data is kept; ./deploy.sh starts it again." ;;
  *) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
