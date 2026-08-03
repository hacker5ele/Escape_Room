# syntax=docker/dockerfile:1

# Build context is the REPOSITORY ROOT, not this folder — npm workspaces need
# the root lockfile and packages/shared. Build it with:
#   docker build -f apps/backend/Dockerfile .
# or let docker compose do it. See ADR-0009.

# ---- Stage 1: dependencies -------------------------------------------------
# Only the manifests are copied here, so this layer is cached and `npm ci`
# re-runs only when dependencies actually change — not on every code edit.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
RUN npm ci

# ---- Stage 2: build --------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend
# shared first: the backend imports its compiled output.
RUN npm run build --workspace @escape-room/shared \
    && npm run build --workspace @escape-room/backend

# ---- Stage 3: runtime ------------------------------------------------------
# No compiler, no dev dependencies, no TypeScript sources.
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
RUN npm ci --omit=dev --workspace @escape-room/backend --include-workspace-root \
    && npm cache clean --force

COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/backend/dist ./apps/backend/dist

# Never run as root.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "apps/backend/dist/index.js"]
