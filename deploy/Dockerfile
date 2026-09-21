FROM node:24-slim AS builder

WORKDIR /app

ENV CI=true
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY lib/db/package.json lib/db/
COPY lib/api-zod/package.json lib/api-zod/
COPY lib/api-spec/package.json lib/api-spec/
COPY lib/api-client-react/package.json lib/api-client-react/
COPY artifacts/api-server/package.json artifacts/api-server/
COPY artifacts/apz-legal/package.json artifacts/apz-legal/

# Use host node_modules to avoid pnpm build-script approval issues in Docker.
# The host is linux-x64, matching the container architecture.
COPY node_modules ./node_modules
COPY artifacts/api-server/node_modules ./artifacts/api-server/node_modules

COPY . .

RUN pnpm install --no-frozen-lockfile

ENV BASE_PATH=/
ENV PORT=3002
RUN cd artifacts/apz-legal && pnpm exec vite build

RUN cd artifacts/api-server && pnpm exec node ./build.mjs

FROM node:24-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs appuser

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/artifacts/api-server/dist ./dist
COPY --from=builder /app/artifacts/apz-legal/dist/public ./public

USER appuser

ENV NODE_ENV=production
ENV PORT=3002

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -sf http://127.0.0.1:3002/api/healthz >/dev/null || exit 1

CMD ["node", "--enable-source-maps", "dist/index.mjs"]
