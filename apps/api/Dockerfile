FROM node:22.14.0-alpine AS base

# Stage 1: Builder (Prune workspace)
FROM base AS builder
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
# Set working directory
WORKDIR /app
RUN corepack enable pnpm
RUN pnpm install turbo@2.11.2 --global
COPY . .
RUN turbo prune api --docker

# Stage 2: Installer
FROM base AS installer
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN corepack enable pnpm

# First install dependencies (as they change less often)
COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# Build the project and its dependencies
COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json
RUN pnpm turbo build --filter=api...

# Stage 3: Runner
FROM base AS runner
WORKDIR /app

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs
USER nestjs

COPY --from=installer --chown=nestjs:nodejs /app .

EXPOSE 3000

CMD ["node", "apps/api/dist/apps/api/src/main.js"]
