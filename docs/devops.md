# Devops

This project uses GitHub Actions for verification, GHCR for container image publishing, and Vercel for the primary web deployment.

## Release Model

Code moves through:

```txt
feature -> pull request -> CI -> merge to main -> release workflow
```

`main` is protected. Direct pushes should be disabled.

## Pull Request CI

Pull requests run:

- format:check
- lint
- typecheck
- unit tests
- build
- web Docker build

Pull request CI does not require production secrets.

## Main Release

Merges to `main` run:

- format:check
- lint
- typecheck
- unit tests
- build
- web Docker build
- web image push to GHCR

Vercel remains the primary production deployment path for the web app.

## Images

The web image is published as:

```txt
ghcr.io/steven-rosales/pressly-web:latest
ghcr.io/steven-rosales/pressly-web:sha-<commit-sha>
ghcr.io/steven-rosales/pressly-web:main-<run-number>
```

The image exists for:

```txt
production parity
registry artifact history
future self-hosting
future api/worker deployment consistency
```

## Environment Variables

Secrets and environment values are owned by the services that use them.

```txt
Vercel owns web deploy env.
GitHub owns CI/release env.
Repo owns only examples, schemas, and docs.
```

Allowed in the repo:

```txt
.env.example
env validation schemas
documentation of required keys
```

Not allowed in the repo:

```txt
.env
.env.local
real tokens
real database URLs
auth secrets
service tokens
```

## GitHub Environment Variables

GitHub `production` environment should define:

```txt
NEXT_PUBLIC_API_BASE_URL
NEXT_PUBLIC_ANALYTICS_ENABLED
NEXT_PUBLIC_POSTHOG_KEY
NEXT_PUBLIC_POSTHOG_HOST
NEXT_PUBLIC_SENTRY_DSN
```

These are used to build the registry web image.

## GitHub Environment Secrets

GitHub may define:

```txt
SENTRY_AUTH_TOKEN
```

Only use it in workflows that intentionally upload source maps.

## Vercel Environment Variables

Vercel should define:

```txt
NEXT_PUBLIC_API_BASE_URL
NEXT_PUBLIC_ANALYTICS_ENABLED
NEXT_PUBLIC_POSTHOG_KEY
NEXT_PUBLIC_POSTHOG_HOST
NEXT_PUBLIC_SENTRY_DSN
SENTRY_AUTH_TOKEN
```

Use Vercel environment scopes:

```txt
Production
Preview
Development
```

## Secret Rules

- Do not commit secrets.
- Do not pass private secrets as Docker build args.
- Only NEXT*PUBLIC*\* values may be passed as web image build args.
- Future API/worker secrets must be injected at runtime, not baked into images.
- Production secrets should be visible only to maintainers and deployment systems.

## Vercel

Vercel remains the primary web deployment target.

```txt
Vercel Production -> production website
Vercel Preview -> pull request previews
GHCR image -> portable web artifact
```

## Future API and Worker

When API and worker are added:

```txt
apps/api    -> Docker image -> deploy target
apps/worker -> Docker image -> deploy target
```

Future release order:

```txt
build images
run migration check
run migrations
deploy api
deploy worker
verify health/readiness
```

## Invariant

GitHub verifies and publishes artifacts.
Vercel deploys the web application.
GHCR stores portable images.
Services own the secrets they consume.

PR CI proves code is safe to merge.
Main workflow publishes portable release artifacts.
Vercel remains the live web deploy path.
GitHub owns CI/registry env.
Vercel owns web production env.
No centralized secret platform.
No secrets in repo.
