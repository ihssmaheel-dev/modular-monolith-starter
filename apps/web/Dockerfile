FROM node:24.21.0-alpine AS base
RUN apk add --no-cache libc6-compat
ENV COREPACK_HOME=/usr/local/share/corepack
RUN corepack enable pnpm && \
    corepack prepare pnpm@10.34.5 --activate && \
    chmod -R a+rX "${COREPACK_HOME}"

FROM base AS builder
WORKDIR /app
COPY . .
RUN pnpm dlx turbo@2.11.2 prune web --docker

FROM base AS installer
WORKDIR /app
ENV CI=true
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
ARG VITE_APP_NAME=Workspace
ENV VITE_APP_NAME=${VITE_APP_NAME}
ARG VITE_EXAMPLE_FEATURES_ENABLED=false
ENV VITE_EXAMPLE_FEATURES_ENABLED=${VITE_EXAMPLE_FEATURES_ENABLED}
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json
COPY tsconfig.base.json tsconfig.base.json
RUN pnpm turbo build --filter=web...

FROM base AS production-dependencies
WORKDIR /app
ENV CI=true
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

FROM base AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 webgroup && adduser --system --uid 1001 webuser
COPY --from=production-dependencies --chown=webuser:webgroup /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=webuser:webgroup /app/package.json ./package.json
COPY --from=production-dependencies --chown=webuser:webgroup /app/apps/web/package.json ./apps/web/package.json
COPY --from=production-dependencies --chown=webuser:webgroup /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=production-dependencies --chown=webuser:webgroup /app/packages ./packages
COPY --from=installer --chown=webuser:webgroup /app/apps/web/dist ./apps/web/dist
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
USER webuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/auth || exit 1
WORKDIR /app/apps/web
CMD ["node", "/app/node_modules/srvx/bin/srvx.mjs", "serve", "--prod", "--static=../client", "--entry=dist/server/server.js"]
