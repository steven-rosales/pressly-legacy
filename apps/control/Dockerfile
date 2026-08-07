FROM node:24.18.0-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo build --filter=@pressly/control... --concurrency=2

FROM nginx:1.30.3-alpine@sha256:0d3b80406a13a767339fbe2f41406d6c7da727ab89cf8fae399e81f780f814d1 AS runner
COPY apps/control/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/apps/control/dist /usr/share/nginx/html
EXPOSE 80
