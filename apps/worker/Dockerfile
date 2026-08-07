FROM node:24.18.0-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS base

RUN apk add --no-cache libc6-compat
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/cli/package.json apps/cli/package.json
COPY apps/processor/package.json apps/processor/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY modules/security/identity/package.json modules/security/identity/package.json
COPY modules/experience/control/package.json modules/experience/control/package.json
COPY modules/experience/processor/package.json modules/experience/processor/package.json
COPY modules/business/orders/package.json modules/business/orders/package.json
COPY modules/business/pricing/package.json modules/business/pricing/package.json
COPY modules/business/production/package.json modules/business/production/package.json
COPY modules/business/users/package.json modules/business/users/package.json
COPY modules/integration/webhook-ingestion/package.json modules/integration/webhook-ingestion/package.json
COPY modules/security/authorization/package.json modules/security/authorization/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/codec/package.json packages/codec/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/errors/package.json packages/errors/package.json
COPY packages/http/package.json packages/http/package.json
COPY packages/kernel/package.json packages/kernel/package.json
COPY packages/logging/package.json packages/logging/package.json
COPY packages/observability/package.json packages/observability/package.json
COPY packages/money/package.json packages/money/package.json
COPY packages/testkit/package.json packages/testkit/package.json
COPY packages/time/package.json packages/time/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
RUN pnpm turbo build --filter=@pressly/worker... --concurrency=2

FROM builder AS runner
ENV NODE_ENV=production
# Production executes Node directly. Package managers and their caches are
# build-only payloads, so keep them out of the runtime attack surface.
RUN rm -rf \
    /pnpm \
    /root/.cache/node/corepack \
    /usr/local/lib/node_modules/corepack \
    /usr/local/lib/node_modules/npm \
    /usr/local/bin/corepack \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/pnpm \
    /usr/local/bin/pnpx \
    /usr/local/bin/yarn \
    /usr/local/bin/yarnpkg \
    /opt/yarn-v1.22.22 \
    && addgroup -S -g 1001 pressly \
    && adduser -S -D -H -u 1001 -G pressly pressly
USER pressly
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=6 CMD ["node", "apps/worker/dist/runtime/healthcheck.js"]
CMD ["node", "--import", "./apps/worker/dist/runtime/observability/instrument.js", "apps/worker/dist/main.js"]
