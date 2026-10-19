# API and worker image (one image, two commands), plus a `migrate` target for the release step:
#   api:    node --enable-source-maps dist/main.js
#   worker: node --enable-source-maps dist/worker.js
#   migrate: pnpm db:migrate && pnpm content:import (docker-compose.prod.yml runs it before api/worker)
# Debian slim (not Alpine) so Prisma's migration engine runs without musl issues.
FROM node:24.21-slim AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/content/package.json packages/content/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @portal/api...
COPY packages/config packages/config
COPY packages/contracts packages/contracts
COPY packages/content packages/content
COPY apps/api apps/api
RUN pnpm --filter @portal/contracts build && pnpm --filter @portal/content build && pnpm --filter @portal/api build

# Release step (runs before api/worker on each deploy): migrations, the app database role, the first
# admin, and the course content. Has the Prisma CLI and the curriculum files.
FROM build AS migrate
COPY content /repo/content
COPY docs/pdf-text.txt /repo/docs/pdf-text.txt
WORKDIR /repo/apps/api
CMD ["sh", "-c", "pnpm db:migrate && pnpm content:import"]

FROM build AS bundle
# Production dependencies only, with the workspace packages resolved into the bundle folder.
RUN pnpm --filter @portal/api --prod deploy --legacy /out \
 && cp -r apps/api/dist /out/dist

FROM node:24.21-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=bundle /out /app
USER node
EXPOSE 3000 3001
CMD ["node", "--enable-source-maps", "dist/main.js"]
