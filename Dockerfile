# Stage 1: Base
ARG NODE_VERSION=22.12.0
FROM node:${NODE_VERSION}-alpine AS base
RUN corepack enable pnpm

# Stage 2: Prune workspace for API
FROM base AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN pnpm install turbo@2.10.12 --global
COPY . .
RUN turbo prune api --docker

# Stage 3: Install dependencies
FROM base AS installer
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# Stage 4: Build packages and API
COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json
RUN pnpm turbo build --filter=api...

# Stage 5: Production Runner
FROM base AS runner
WORKDIR /app
RUN corepack enable pnpm

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Copy built app and dependencies
COPY --from=installer /app .
COPY --from=builder /app/migrations ./migrations

RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/v1/health/live || exit 1

CMD ["node", "apps/api/dist/apps/api/src/main.js"]
