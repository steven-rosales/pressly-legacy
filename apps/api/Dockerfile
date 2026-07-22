FROM node:24.18.0-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS base

RUN apk add --no-cache libc6-compat

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /repo

FROM base AS deps

COPY apps/cli/package.json apps/cli/package.json
COPY apps/processor/package.json apps/processor/package.json
COPY modules/policy/access-control/package.json modules/policy/access-control/package.json
COPY modules/business/auth/package.json modules/business/auth/package.json
COPY modules/business/orders/package.json modules/business/orders/package.json
COPY modules/business/users/package.json modules/business/users/package.json
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY modules/business/pricing/package.json modules/business/pricing/package.json
COPY modules/business/production/package.json modules/business/production/package.json
COPY modules/business/webhook-ingestion/package.json modules/business/webhook-ingestion/package.json
COPY modules/policy/production/package.json modules/policy/production/package.json
COPY modules/computation/order-control/package.json modules/computation/order-control/package.json
COPY modules/computation/scheduling/package.json modules/computation/scheduling/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/errors/package.json packages/errors/package.json
COPY packages/http/package.json packages/http/package.json
COPY packages/kernel/package.json packages/kernel/package.json
COPY packages/logging/package.json packages/logging/package.json
COPY packages/metrics/package.json packages/metrics/package.json
COPY packages/money/package.json packages/money/package.json
COPY packages/testkit/package.json packages/testkit/package.json
COPY packages/time/package.json packages/time/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS dev

COPY . .

EXPOSE 4000

CMD ["pnpm", "-F", "@pressly/api", "dev"]

FROM deps AS builder

COPY . .

RUN pnpm turbo build --filter=@pressly/api... --filter=@pressly/cli...

FROM builder AS runner

ENV NODE_ENV=production

RUN rm -rf /pnpm/store \
    && addgroup -S -g 1001 pressly \
    && adduser -S -D -H -u 1001 -G pressly pressly

USER pressly

EXPOSE 4000

CMD ["node", "apps/api/dist/main.js"]
