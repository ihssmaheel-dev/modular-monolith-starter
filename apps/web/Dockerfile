FROM node:22.12.0-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable pnpm

FROM base AS builder
WORKDIR /app
RUN pnpm install turbo@2.11.2 --global
COPY . .
RUN turbo prune web --docker

FROM base AS installer
WORKDIR /app
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
ARG VITE_APP_NAME=Workspace
ENV VITE_APP_NAME=${VITE_APP_NAME}
ARG VITE_EXAMPLE_FEATURES_ENABLED=false
ENV VITE_EXAMPLE_FEATURES_ENABLED=${VITE_EXAMPLE_FEATURES_ENABLED}
COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json
RUN pnpm turbo build --filter=web...

FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 webgroup && adduser --system --uid 1001 webuser
COPY --from=installer --chown=webuser:webgroup /app .
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
USER webuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1
WORKDIR /app/apps/web
CMD ["node", "/app/node_modules/srvx/dist/cli.mjs", "--prod", "--static=../client", "--entry=dist/server/server.js"]
