FROM node:24-alpine AS base

RUN apk add --no-cache libc6-compat

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /repo

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY modules/pricing/package.json modules/pricing/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/errors/package.json packages/errors/package.json
COPY packages/http/package.json packages/http/package.json
COPY packages/logging/package.json packages/logging/package.json
COPY packages/metrics/package.json packages/metrics/package.json
COPY packages/testkit/package.json packages/testkit/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS dev

COPY . .

EXPOSE 4000

CMD ["pnpm", "-F", "@pressly/api", "dev"]

FROM deps AS builder

COPY . .

RUN pnpm -F @pressly/api build

FROM builder AS runner

ENV NODE_ENV=production

EXPOSE 4000

CMD ["pnpm", "-F", "@pressly/api", "start"]
