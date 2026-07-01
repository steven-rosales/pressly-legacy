# Selective Observability And Error Handling Evidence

## Work

- Work ID: `observability-error-handling`
- Network: `stateworks/work/done/observability-error-handling/network.yaml`
- Started: `2026-07-01`
- Finished: pending

## Activation

- Status: active
- Date: `2026-07-01`
- Source plan: `stateworks/work/queued/observability-error-handling/network.yaml`
- Active plan: `stateworks/work/done/observability-error-handling/network.yaml`

## Commands

```text
command: mkdir -p stateworks/work/done/observability-error-handling
exit: 0
time: 2026-07-01
summary: Created the active work directory.
```

```text
command: cp stateworks/work/queued/observability-error-handling/network.yaml stateworks/work/done/observability-error-handling/network.yaml
exit: 0
time: 2026-07-01
summary: Copied the queued network into active work.
```

```text
command: cp stateworks/work/queued/observability-error-handling/brief.md stateworks/work/done/observability-error-handling/brief.md
exit: 0
time: 2026-07-01
summary: Copied the queued brief into active work.
```

## T1 Audit

Status: committed

Parallel read-only audit slices:

- API boundary: runtime, HTTP error handling, request context, API observability adapters.
- Web boundary: WebCore runtime, command/action wrappers, Web observability adapters.
- Shared/config: `AppError`, `Result`, logging, metrics, Sentry adapters, env and deployment configuration.

Subagents:

- API boundary audit: completed, read-only, no files changed.
- Web boundary audit: completed, read-only, no files changed.
- Shared/config audit: completed, read-only, no files changed.

### Files Read

- `packages/errors/src/app-error.ts`
- `packages/kernel/src/result.ts`
- `packages/logging/src/logger.ts`
- `packages/logging/src/redact.ts`
- `packages/logging/src/security-event.ts`
- `packages/metrics/src/counter.ts`
- `packages/metrics/src/error-reporter.ts`
- `packages/http/src/api-response.ts`
- `apps/api/src/index.ts`
- `apps/api/src/app.ts`
- `apps/api/src/instrument.ts`
- `apps/api/src/common/runtime/runtime.ts`
- `apps/api/src/common/http/error-handler.ts`
- `apps/api/src/common/http/request-context.ts`
- `apps/api/src/common/logging/security-events.ts`
- `apps/api/src/common/observability/sentry.ts`
- `apps/api/src/common/security/rate-limit.ts`
- `apps/api/src/routes/health.routes.ts`
- `apps/api/src/common/config/env.ts`
- `apps/web/src/common/core/runtime/core.ts`
- `apps/web/src/common/core/actions/command.ts`
- `apps/web/src/common/core/actions/command.test.ts`
- `apps/web/src/common/core/actions/query.ts`
- `apps/web/src/common/core/actions/query.test.ts`
- `apps/web/src/common/adapters/observability/sentry-reporter.ts`
- `apps/web/src/common/adapters/requests/fetch-request-client.ts`
- `apps/web/src/common/adapters/runtime/server-web-core.ts`
- `apps/web/src/common/adapters/runtime/web-core-context.tsx`
- `apps/web/src/common/testing/make-test-web-core.ts`
- `apps/web/src/app/global-error.tsx`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/instrumentation.ts`
- `apps/web/src/instrumentation-client.ts`
- `apps/web/sentry.server.config.ts`
- `apps/web/src/common/config/env.ts`
- `docker-compose.yml`
- `infra/aws/docs/env/api.env.example`
- `infra/aws/docs/env/web.env.example`
- `infra/aws/lightsail/deploy.sh`

### Current Ports And Adapters

- `AppError` is the normalized error value object with `kind`, `code`, `safeMessage`, `status`, `details`, `cause`, and optional `traceId`.
- `Result` is a separate control-flow primitive in `packages/kernel`, not part of `packages/errors`.
- `Logger` is a typed logging port with a generic recursive redaction helper.
- `SecurityEventSink` is a narrow semantic port for auth, validation, server, MFA, and deployment signals.
- `CounterSink` exists with fixed counter names.
- `ErrorReporter` exists with `capture(error, context)` and `shutdown()`.
- API runtime currently carries `env`, `logger`, `securityEvents`, and `database`; it does not yet carry `ErrorReporter` or `CounterSink`.
- API Sentry exists as a runtime adapter, but it is wired directly through SDK middleware and startup capture instead of a Pressly-owned reporting policy.
- Web already has the better composition shape: `WebCorePorts` includes `logger`, `analytics`, `errors`, `feedback`, and `request`; `createWebCore(...)` builds command/query helpers from those ports.
- Web Sentry is already behind an `ErrorReporter` adapter for command/query paths, but some framework hooks call Sentry directly.

### Gaps

- API Sentry capture happens before Pressly normalization/classification because `setupSentryErrorHandler(app, ...)` is installed before `makeErrorHandler(...)`.
- API request context logs every non-health request start/completion, including successful requests.
- API error handling logs every handled `AppError` at error level, including routine 400/404/409/422/429 failures.
- API rate limiting logs and emits a security event before the central error handler logs the resulting 429 again.
- API readiness failures bypass the central error policy by logging locally and returning 503 directly.
- API response details are not bounded by a safe details policy.
- Web command failures capture every failure to `ErrorReporter`, and existing tests expect a 400 validation command failure to be reported.
- Web query suppression is local and incomplete: low criticality suppresses, but medium/high routine 4xx can still report.
- Web Sentry context sends `AppError.details` and arbitrary `extra` without the same redaction boundary as logging.
- Web Sentry framework hooks can bypass `WebCore` policy.
- Web Sentry client/server defaults are broader than this work item wants, including PII and high tracing/replay/logging settings when enabled.
- Web fetch parses API trace IDs but does not preserve them into the resulting `AppError` reporting context.
- Local Compose is missing required `AUTH_MFA_ENCRYPTION_KEY`.
- `POSTHOG_ENABLED` in Compose does not match the Web env parser, which reads `NEXT_PUBLIC_ANALYTICS_ENABLED`.
- Deployment failure vocabulary exists, but the Lightsail deploy script does not emit deployment observability signals.

### Target Shape

Use a pure, shared observability policy before SDK/adapters:

```text
runtime fact
-> normalize to AppError or observation
-> classify with Pressly policy
-> redact/enrich safe context
-> interpret as report, count, log, alert, or suppress
```

The policy should be shared vocabulary, not shared runtime plumbing:

- API composes reporters/counters at the API runtime boundary and interprets request/server failures.
- Web composes reporters at `createWebCore(...)` and interprets command/query/framework failures with Web-specific context.
- Business modules should not import Sentry, generic logging helpers, or generic observability helpers.
- Modules can keep using narrow semantic ports like `SecurityEventSink`.

### First Implementation Slice

Start with `T2`, a shared pure policy module inside the existing observability packages, not a new platform.

The first policy should classify:

- report: `status >= 500`, startup/server failures, deployment failures, product-critical command/query failures, and selected security signals.
- suppress: routine validation failures, not-found failures, rate-limit/client mistakes, successful requests, and low-criticality expected misses.
- attach: decision reason, log level, optional counter, and bounded safe context.

Then wire the policy through:

- API runtime: add `ErrorReporter` and `CounterSink`, remove SDK-first request-error capture, and let `makeErrorHandler` interpret policy after normalization.
- WebCore: replace embedded command/query capture rules with policy decisions while preserving user feedback behavior.
- Config: fix local env drift and keep Sentry disabled locally by default.

### T1 Verification

```text
command: /home/steven/pressly/node_modules/.bin/tsx stateworks/tooling/validate-network.ts /home/steven/pressly-observability/stateworks/work/done/observability-error-handling/network.yaml
exit: 0
time: 2026-07-01
summary: Active observability network is valid with 8 tasks.
```

```text
command: /home/steven/pressly/node_modules/.bin/tsx stateworks/tooling/next-batch.ts /home/steven/pressly-observability/stateworks/work/done/observability-error-handling/network.yaml --state /home/steven/pressly-observability/stateworks/work/done/observability-error-handling/state.yaml
exit: 0
time: 2026-07-01
summary: With T1 running, no next-ready tasks were available.
```

```text
command: /home/steven/pressly/node_modules/.bin/tsx stateworks/tooling/verify.ts /home/steven/pressly-observability/stateworks/work/done/observability-error-handling/network.yaml --state /home/steven/pressly-observability/stateworks/work/done/observability-error-handling/state.yaml
exit: 0
time: 2026-07-01
summary: Active work was not done, had no stop reasons, and had no next-ready tasks while T1 was running.
```

## Decisions

- Decision: Activate by copying queued work into `active` and adding runtime state/evidence files.
  Reason: The repo's `stateworks/work/README.md` says active work adds state, evidence, human-actions, and final-report files while preserving the planned work item shape.
  Date: `2026-07-01`

- Decision: Start with T1 only.
  Reason: The network dependencies make T2 depend on committed T1 audit evidence, so implementation should wait until the current surfaces and first slice are recorded.
  Date: `2026-07-01`

- Decision: Use a shared policy interpreter as the next slice.
  Reason: The current API and Web both have useful ports, but the reporting decisions are embedded in boundary code or SDK hooks. A pure classifier gives SICP-style data flow without adding a generic observability platform.
  Date: `2026-07-01`

## Open Risks

- Risk: Web framework-level Sentry hooks may still need framework-specific handling outside `WebCore`.
  Owner: agent
  Next step: Keep direct hooks minimal and route custom command/query reporting through policy first.

- Risk: Env/example drift can block local verification before observability behavior is testable.
  Owner: agent
  Next step: Keep the T5 env cleanup in scope, but do not mark it verified until Compose/env checks run.

## Queue Cleanup

Status: committed

```text
command: rm -rf stateworks/work/queued/observability-error-handling
exit: 0
time: 2026-07-01
summary: Removed the queued duplicate after the work item was active.
```

## T2 Declarative Observability Policy

Status: committed

Files changed:

- `packages/metrics/src/observability-policy.ts`
- `packages/metrics/src/counter.ts`
- `packages/metrics/src/error-reporter.ts`
- `packages/metrics/src/index.ts`
- `packages/metrics/test/observability-policy.test.ts`
- `packages/logging/src/redact.ts`
- `packages/logging/test/redact.test.ts`

Behavior:

- Pure policy classifies observations without importing API, Web, Express, Next.js, or Sentry.
- Routine client validation and not-found failures suppress reporting.
- API server failures report, alert, log at error level, and increment `api.server_errors`.
- Explicit product-critical Web failures report even when the HTTP status is a routine client status.
- Singleton auth denials suppress; threshold denials and auth-login rate limits alert.
- Redaction now treats MFA material and recovery codes as sensitive fields.

```text
command: pnpm --filter @pressly/metrics test
exit: 0
time: 2026-07-01
summary: 7 metrics tests passed, including observability policy classification.
```

```text
command: pnpm --filter @pressly/logging test
exit: 0
time: 2026-07-01
summary: 4 logging tests passed, including MFA/recovery-code redaction.
```

## T3 API Boundary Observability

Status: committed

Files changed:

- `apps/api/src/common/observability/api-observability.ts`
- `apps/api/src/common/observability/sentry.ts`
- `apps/api/src/common/runtime/runtime.ts`
- `apps/api/src/common/http/error-handler.ts`
- `apps/api/src/common/http/request-context.ts`
- `apps/api/src/common/logging/security-events.ts`
- `apps/api/src/common/security/rate-limit.ts`
- `apps/api/src/app.ts`
- `apps/api/src/index.ts`
- `apps/api/src/server.ts`
- `apps/api/test/security/request-boundary.middleware.test.ts`
- `apps/api/test/security/security-events.test.ts`

Behavior:

- API runtime now carries injected `ErrorReporter` and `CounterSink` ports.
- Express Sentry error middleware was removed from `app.ts`; Sentry capture now happens through the Pressly reporter after policy classification.
- `makeErrorHandler` reports policy-approved 5xx errors, increments counters, logs only reportable server failures, and suppresses routine 4xx captures.
- API response errors receive a request trace ID; 5xx response details are bounded out of the public failure envelope.
- Request context no longer logs every request start/completion; it logs failed 5xx requests only.
- Generic rate-limit middleware no longer logs every 429 directly; the security sink policy alerts only selected auth-login rate limits.
- Startup/server failures route through the same runtime-failure policy.

```text
command: pnpm --filter @pressly/api test
exit: 0
time: 2026-07-01
summary: 4 API test files passed, 28 tests total.
```

## T4 Web Core Observability Policy

Status: committed

Files changed:

- `apps/web/src/common/core/actions/observability.ts`
- `apps/web/src/common/core/actions/action-meta.ts`
- `apps/web/src/common/core/actions/command.ts`
- `apps/web/src/common/core/actions/query.ts`
- `apps/web/src/common/core/actions/command.test.ts`
- `apps/web/src/common/core/actions/query.test.ts`
- `apps/web/src/common/adapters/observability/sentry-reporter.ts`
- `apps/web/src/common/adapters/requests/fetch-request-client.ts`
- `apps/web/src/app/global-error.tsx`
- `apps/web/src/instrumentation-client.ts`
- `apps/web/sentry.server.config.ts`
- `apps/web/sentry.edge.config.ts`

Behavior:

- `WebCore` remains the Web composition factory.
- Command/query failures now use the shared policy vocabulary before reporting.
- User feedback remains separate from incident reporting.
- High UI criticality alone does not report routine 400/404 failures.
- Explicit `productCritical` action metadata reports important product failures.
- API trace IDs propagate into Web request `AppError`s.
- Web Sentry contexts redact details and extra fields before capture.
- Web Sentry defaults now disable broad logs, default PII, and replay collection; traces default to `0.1`.

```text
command: pnpm --filter @pressly/web test
exit: 0
time: 2026-07-01
summary: 14 Web test files passed, 33 tests total.
```

## T5 Local And Deployment Observability Configuration

Status: committed

Files changed:

- `apps/api/.env.example`
- `apps/web/.env.example`
- `apps/web/src/common/config/env.ts`
- `docker-compose.yml`
- `infra/aws/docs/env/web.env.example`
- `infra/aws/lightsail/deploy.sh`

Behavior:

- API and Web local env examples now document non-secret local defaults and Sentry-disabled development defaults.
- Local Compose now includes the required `AUTH_MFA_ENCRYPTION_KEY`.
- Removed the unused API-side `POSTHOG_ENABLED` Compose variable.
- Web Sentry trace sample rate is documented and passed through build/runtime env.
- Lightsail deploy script emits bounded `deployment.succeeded` / `deployment.failed` JSON without env values or secrets.

```text
command: docker compose config
exit: 0
time: 2026-07-01
summary: Compose config resolved successfully and includes API MFA key plus Web Sentry sample-rate env.
```

## V1 Local High-Signal Verification

Status: committed

Signal matrix:

- Routine API 4xx validation/client failures: Sentry suppressed, counters suppressed, response remains safe.
- API 5xx server failures: Sentry capture through `ErrorReporter`, `api.server_errors` counter, error log, request trace ID.
- Routine security singleton events: suppressed.
- Repeated authorization/login denials: alert log and selected counter at threshold.
- Auth-login rate limits: selected alert and `security.rate_limits` counter.
- Generic route rate limits: suppressed from alert/log path.
- Routine Web 400/404 command/query failures: feedback/result preserved, Sentry suppressed.
- Web 5xx failures: Sentry capture through `WebCore` reporter.
- Web product-critical failures: Sentry capture through explicit action metadata.
- Deployment success/failure: bounded deploy event emitted by script; external Sentry alerting remains H1.

Verification commands:

```text
command: pnpm install --frozen-lockfile --offline
exit: 0
time: 2026-07-01
summary: Materialized ignored worktree-local dependency links without changing the lockfile.
```

```text
command: pnpm typecheck
exit: 0
time: 2026-07-01
summary: 35 typecheck tasks succeeded across the workspace.
```

```text
command: pnpm lint
exit: 0
time: 2026-07-01
summary: 20 lint tasks succeeded across the workspace.
```

```text
command: pnpm format:check
exit: 0
time: 2026-07-01
summary: Prettier check passed for all matched files after formatting touched files.
```

```text
command: pnpm test
exit: 0
time: 2026-07-01
summary: 35 test tasks succeeded across the workspace.
```

```text
command: git diff --check
exit: 0
time: 2026-07-01
summary: No whitespace errors.
```

## H1 Human Action Gate

Status: committed

The repo-side implementation is ready for external Sentry setup. Human action is required to create or confirm separate API/Web Sentry projects, store DSNs outside the repository, and configure alert rules for server errors, product-critical failures, failed deployments, and selected security signals only.

Human-provided redacted proof:

- Sentry projects: `pressly-api` and `pressly-web`.
- Human confirmed production DSNs and release/environment values are stored outside the repository.
- Human confirmed advanced data scrubbing is configured on both projects for auth headers, cookies, request data, user IP address, and sensitive extra data.
- Human confirmed issue alert rules are configured for API critical errors and Web critical failures.
- Redacted API Sentry test notification:
  - Issue type: new issue.
  - Issue title: `Test Issue Test notification`.
  - Event ID: `d6e13c4553194181b3f69615c8830472`.
  - Timestamp: `2026-07-01T15:51:59Z`.
  - Project: `pressly-api`.
  - Level: `error`.
  - Trigger: Issue Stream notification.
- No DSNs, tokens, cookies, bearer tokens, MFA material, recovery codes, or raw request bodies were recorded.

Limitations:

- Agent did not independently log in to Sentry.
- Human could not copy full Sentry configuration from the UI, so Web external setup is recorded by human confirmation rather than a pasted Web event.
- Repo tests already verify Web critical-failure reporting and routine-failure suppression through the injected reporter path.

## H1 Support Patch: Production Web Sentry Build Env

Status: committed

- Production Web artifact builds now pass `NEXT_PUBLIC_SENTRY_DSN` from GitHub Actions secrets into the Web Docker build.
- Production Web artifact builds now pass `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` from GitHub Actions variables, defaulting to `0.1`.
- `apps/web/Dockerfile` now consumes `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` in both builder and runner stages, matching the existing DSN pass-through.

```text
command: pnpm format:check
exit: 0
time: 2026-07-01
summary: Prettier check passed after wiring production Web Sentry build environment values.
```

```text
command: git diff --check
exit: 0
time: 2026-07-01
summary: No whitespace errors after the CI/Dockerfile support patch.
```

## V2 External Observability Proof

Status: committed

Final signal matrix:

- API Sentry project exists: confirmed by human.
- Web Sentry project exists: confirmed by human.
- API critical error alerting: configured by human and demonstrated by redacted `pressly-api` test notification.
- Web critical failure alerting: configured by human; repo-side Web reporter behavior is covered by local tests.
- Routine API/Web client failures: suppressed by policy and covered by local tests.
- PII/request-body minimization: advanced data scrubbing configured by human on both Sentry projects, with repo-side redaction also in place.

Result: the repo-side observability work and human Sentry setup are complete.
