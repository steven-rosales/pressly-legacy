# Observability

The operational question is: when the floor reports a failure, can we identify
the affected release, browser action, API request, and background-processing
state without reproducing it first?

## Current signal path

| Surface   | Signals                                                                                                                   | Correlation                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Processor | Sentry browser errors and traces, root error boundary, sanitized navigation/request breadcrumbs                           | UI errors retain the API `X-Request-Id` or `traceId`; source maps and the exact Git SHA are attached at image build time |
| API       | Sentry logs, errors, HTTP and database traces, typed metrics, live/readiness endpoints                                    | Request ID, trace ID, route, operation, and the exact deployed Git SHA                                                   |
| Worker    | Sentry logs, errors, named-job and database traces, typed job/queue metrics, file heartbeat, Sentry Cron check-in         | Job, operation, bounded metric attributes, and the exact deployed Git SHA                                                |
| Host      | Docker healthchecks, infrastructure logs, and a bounded emergency log ring for telemetry initialization or flush failures | Immutable image digests and the same source SHA in release metadata                                                      |

The Processor DSN is public browser configuration. CI may pass it as a build
argument. The Sentry auth token is different: it is an upload credential and is
available only as an optional BuildKit secret while source maps are uploaded.
It is never a build argument, image environment variable, or runtime file.
Uploaded maps are removed from the image artifact.

Production deployment injects the validated source SHA as `SENTRY_RELEASE` for
API and Worker. Processor compiles that same SHA as `VITE_SENTRY_RELEASE`.
`production` is the Sentry environment for all three. Local and offline-smoke
builds use distinct environment/release names and do not upload source maps.
Production Compose forces API/Worker Sentry on and API metric export on; a
missing runtime DSN therefore prevents those services from starting silently
without their required visibility.

When Sentry is enabled—as production requires—API and Worker application logs
go directly through the Sentry structured-log SDK. They are not mirrored to
stdout or stderr during normal operation. Disabled local development retains
the JSON console logger. When initialization fails or an SDK logger call fails
synchronously, the process writes only that sanitized error/fatal break-glass
record to stderr; info and warning logs are never mirrored. Asynchronous
transport outages are not mirrored. Shutdown writes a fixed flush-failure
record if delivery cannot complete. The Docker JSON-file ring is retained for
those recovery signals and infrastructure services.

## Signal contracts

`@pressly/observability` is the deployment-neutral catalog for every metric's
instrument, unit, and allowed attributes. API and Worker are separate Sentry
interpreters of that catalog. Values outside a finite vocabulary become
`other`; undeclared attributes are discarded. IDs, arbitrary URLs, SQL,
parameters, payloads, customer data, and exception messages are never metric
attributes.

Named Worker jobs create `worker.job` spans and record every busy or failed
pass. Successful idle-pass metrics are sampled at most once per minute. Queue
retry, lease, and dead-letter semantics remain inside the owning job. The
Orders outbox health sample is one aggregate query per minute, emitting depth
and oldest-pending-age gauges.

Correctness-sensitive unit-of-work boundaries create `db.transaction` spans
and emit committed, expected-rollback, or failed outcomes with monotonic
durations. Result-aware wrappers sit outside result-aware database units of
work, after private rollback signals have become typed failures. Business
meaning such as replay, no-op, conflict, or invariant rejection remains in the
owning use case.

Sentry Cron observes missed Worker progress only. It does not schedule work or
provide singleton execution. Polling, leases, fencing, idempotency, retries,
and reconciliation remain Worker/database responsibilities.

## Required Sentry views

Create these views before the pilot; repository code emits the signals but
cannot select notification recipients.

1. **Floor reliability** — Processor issues by release, `api.http_requests` by
   status/route, `api.http_request_duration_seconds`,
   `api.command_conflicts`, and `product.invariant_failures`.
2. **Live synchronization** — `api.sse_active_connections`, opened/closed
   `api.sse_connections`, `api.sse_resyncs`, and `api.sse_feed_failures`.
3. **Inbound work** — inbox and Orders-outbox pending count/age, named-job pass
   outcome/duration, processing latency, completed, retried, failed,
   dead-lettered, recovered-lease, and lost-lease signals.
4. **Production flow** — plan supersessions, runs started, placement outcomes,
   queue conflicts, freezes, and overtime confirmations.
5. **Transactions** — transaction outcome and p95 duration by bounded
   `operation`, correlated with HTTP or Worker-job traces.

## Initial alert policy

- Uptime: alert after two consecutive failures of API readiness, Web health,
  or Processor health; recover after two successes.
- Processor: alert on a new or regressed production issue immediately; alert
  on a sustained browser error spike over five minutes.
- API: critical on any sustained 5xx increase; warning on p95 request duration
  above two seconds for ten minutes. Do not page on isolated expected 409s.
- SSE: critical on `api.sse_feed_failures >= 1` in five minutes; warning when
  resyncs remain elevated for ten minutes.
- Worker: use the exact Cron, backlog, retry, dead-letter, lease-loss, and loop
  rules in `apps/worker/README.md`.
- Security: route authentication failures and sustained rate-limit or login
  abuse to the security destination, not the floor-operations channel.

Tune thresholds from pilot traffic after one week. Loosening an alert requires
evidence that it is noisy; disabling the underlying signal does not.

## Floor incident runbook

1. Record the screen, command, time, location/run, and displayed error
   reference. Do not include customer payloads.
2. Search Sentry by reference, then bind the browser event to its release SHA
   and API request/trace. Check whether the issue began with that release.
3. Check API readiness and the Floor reliability/Live synchronization views.
   If intake is involved, also check Worker heartbeat, queue age, and dead
   letters.
4. Query Sentry Logs for the affected runtime, release, operation, and time,
   then pivot from the log to its trace and issue. Do not search by customer
   payload or add customer data to the query.
5. Use `docker compose logs --since <time> api worker` only when Sentry itself
   is unavailable. It may contain initialization failures, synchronous
   error/fatal writer fallbacks, or final flush failures; it is not a complete
   mirror of an asynchronous Sentry outage. Continue with host/network
   diagnostics rather than treating Docker as the primary log store.
6. Before retrying a physical command, reload the authoritative board and
   verify its state. Command idempotency protects retries; operator observation
   protects the physical floor from repeating completed work.
7. Roll back only for a release regression whose migrated database remains
   compatible. Use the recovery procedure for data damage or host loss.
8. Record cause, mitigation, affected release, and missing signal. Add the
   missing signal or runbook step before closing the incident.

Staging must prove source-map symbolication, reference-ID lookup, one API alert,
one SSE failure alert, the Worker missed-Cron alert, and recovery notifications
before production notifications are considered configured.

## Related Runbooks

- [Local LPMS production-run simulation](./runbooks/lpms-local-production-run.md)
  exercises the synthetic floor workflow without resetting shared development
  data.
- [Cents webhook local proof](./runbooks/cents-webhook.md) isolates signed ingress
  and duplicate-delivery behavior.
- [Production migrations](./ops/production-migrations.md) defines database
  release and recovery constraints.
