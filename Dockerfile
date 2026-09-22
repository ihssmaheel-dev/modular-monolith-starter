# Stage 1: Base
ARG NODE_VERSION=24.21.0
FROM node:${NODE_VERSION}-alpine AS base
ENV COREPACK_HOME=/usr/local/share/corepack
RUN corepack enable pnpm && \
    corepack prepare pnpm@10.34.5 --activate && \
    chmod -R a+rX "${COREPACK_HOME}"

# Stage 2: Prune workspace for API
FROM base AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY . .
RUN pnpm dlx turbo@2.11.2 prune api --docker

# Stage 3: Install dependencies
FROM base AS installer
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV CI=true

COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# Stage 4: Build packages and API
COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json
COPY tsconfig.base.json tsconfig.base.json
RUN pnpm turbo build --filter=api...

# Stage 5: Install only the production dependency graph. Keeping this separate
# from the compiler workspace avoids pnpm prune/link conflicts and excludes
# build tooling from the runtime image.
FROM base AS production-dependencies
WORKDIR /app
ENV CI=true
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# Stage 6: Production Runner
FROM base AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Copy only the production dependency closure and built runtime assets.
COPY --from=production-dependencies --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=appuser:appgroup /app/package.json ./package.json
COPY --from=production-dependencies --chown=appuser:appgroup /app/apps/api/package.json ./apps/api/package.json
COPY --from=production-dependencies --chown=appuser:appgroup /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=production-dependencies --chown=appuser:appgroup /app/packages ./packages
COPY --from=installer --chown=appuser:appgroup /app/apps/api/dist ./apps/api/dist
COPY --from=installer --chown=appuser:appgroup /app/packages/authorization/dist ./packages/authorization/dist
COPY --from=installer --chown=appuser:appgroup /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=installer --chown=appuser:appgroup /app/packages/email/dist ./packages/email/dist
COPY --from=installer --chown=appuser:appgroup /app/packages/i18n/dist ./packages/i18n/dist
COPY --from=builder /app/migrations ./migrations

USER appuser

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/v1/health/live || exit 1

CMD ["node", "apps/api/dist/apps/api/src/main.js"]
