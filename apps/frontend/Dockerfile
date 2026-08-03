# syntax=docker/dockerfile:1

# Build context is the REPOSITORY ROOT — see the note in apps/backend/Dockerfile.

# ---- Stage 1: dependencies -------------------------------------------------
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
COPY apps/frontend ./apps/frontend
RUN npm run build --workspace @escape-room/shared \
    && npm run build --workspace @escape-room/frontend

# ---- Stage 3: runtime ------------------------------------------------------
# Static files only. nginx handles the SPA fallback and proxies /api to the
# backend, which is why the bundle contains no backend URL.
FROM nginx:alpine AS runtime
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1
