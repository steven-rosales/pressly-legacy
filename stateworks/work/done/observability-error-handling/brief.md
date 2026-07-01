# Selective Observability And Error Handling

## Purpose

Give agents and operators a reliable view of the system without flooding the
server or Sentry with low-value events.

The point is not "more logs." The point is a small set of data structures and
invariants that make important failures visible, explainable, and repairable.

## Principle

Observability should be a declarative policy interpreted at runtime boundaries.

```text
runtime fact
-> normalize to AppError or observation
-> classify by policy
-> enrich with safe context
-> report, count, log, alert, or suppress
-> record verification evidence
```

That loop is the useful algorithm. Sentry is only one interpreter target.

## Architecture Shape

- Shared vocabulary lives in packages such as `packages/metrics` and
  `packages/logging`.
- API composition injects API observability through `ApiRuntime`, the app/error
  boundary, server startup, and shutdown.
- Web composition keeps the `createWebCore(...)` factory pattern and injects
  Web-specific context through command/query runtimes.
- Business modules do not import Sentry, generic observability helpers, or broad
  logging APIs.
- Modules may emit narrow semantic facts when the fact is part of the use case,
  for example `SecurityEventSink`.

## API And Web Are Different

API owns server context:

- request ID
- route
- status code
- `AppError` kind and code
- security event context
- startup and shutdown failure context

Web owns interaction context:

- action name
- rail
- criticality
- browser route
- distinct actor ID
- feedback behavior

They may share the policy language, but they should not share one runtime shell.

## Report

Report these by default:

- `5xx` server errors
- startup failures
- product-critical command failures
- deployment failures
- selected security events such as MFA recovery use, repeated login failure,
  authorization anomaly, privileged mutation, and alert delivery failure

Suppress these by default:

- routine `4xx` validation failures
- normal not-found responses
- expected low-criticality query misses
- successful requests
- every-event product analytics
- raw request, credential, or secret material

## Definition Of Done

- API and Web both use declarative reporting policy.
- Sentry is behind a port and can be disabled without changing business code.
- Tests prove both positive reporting and negative suppression.
- Evidence records the final signal matrix.
- External Sentry setup is explicit human work with redacted proof.
