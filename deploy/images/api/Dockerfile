FROM node:24.18.0-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS base

RUN apk add --no-cache libc6-compat

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /repo

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Fetch from the complete lockfile before copying source. The later offline
# install discovers every workspace package from pnpm-workspace.yaml, so adding
# a package never requires another Dockerfile COPY entry.
RUN pnpm fetch --frozen-lockfile

FROM deps AS dev

COPY . .
RUN pnpm install --offline --frozen-lockfile

EXPOSE 4000

CMD ["pnpm", "-F", "@pressly/http-host", "dev"]

FROM deps AS builder

COPY . .
RUN pnpm install --offline --frozen-lockfile

RUN pnpm turbo build --filter=@pressly/http-host... --filter=@pressly/cli-host... --concurrency=2

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

EXPOSE 4000

CMD ["node", "hosts/http/dist-runtime/main.js"]
