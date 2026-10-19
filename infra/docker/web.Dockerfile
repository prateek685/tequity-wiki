# Caddy image with the built React app baked in (see infra/caddy/Caddyfile).
FROM node:24.21-slim AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @portal/web...
COPY packages/config packages/config
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN pnpm --filter @portal/contracts build && pnpm --filter @portal/web exec vite build

FROM caddy:2.11.7-alpine
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv/web
