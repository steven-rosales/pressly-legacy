# Observability

The operational question is: when the floor reports a failure, can we identify
the affected release, browser action, API request, and background-processing
state without reproducing it first?

## Current signal path

| Surface   | Signals                                                                                                                                                    | Correlation                                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Processor | Sentry browser errors and traces, root error boundary, sanitized navigation/request breadcrumbs                                                            | UI errors retain the API `X-Request-Id` or `traceId`; source maps and the exact Git SHA are attached at image build time |
| API       | Structured JSON logs, Sentry errors/traces, HTTP duration/count metrics, production-policy counters, SSE connection/feed metrics, live/readiness endpoints | Request ID, trace ID, route, operation, and the exact deployed Git SHA                                                   |
| Worker    | Structured JSON logs, Sentry errors, job/backlog metrics, file heartbeat, Sentry Cron check-in                                                             | Job operation, bounded metric labels, and the exact deployed Git SHA                                                     |
| Host      | Docker healthchecks and bounded JSON-file logs                                                                                                             | Immutable image digests and the same source SHA in release metadata                                                      |

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

## Required Sentry views

Create these views before the pilot; repository code emits the signals but
cannot select notification recipients.

1. **Floor reliability** — Processor issues by release, `api.http_requests` by
   status/route, `api.http_request_duration_seconds`,
   `api.command_conflicts`, and `product.invariant_failures`.
2. **Live synchronization** — `api.sse_active_connections`, opened/closed
   `api.sse_connections`, `api.sse_resyncs`, and `api.sse_feed_failures`.
3. **Inbound work** — Worker pending count/age, processing latency, completed,
   retried, failed, dead-lettered, recovered-lease, and lost-lease signals.
4. **Production flow** — plan supersessions, runs started, placement outcomes,
   queue conflicts, freezes, and overtime confirmations.

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
4. Read only the bounded service logs needed for that time and release:
   `docker compose logs --since <time> api worker processor`.
5. Before retrying a physical command, reload the authoritative board and
   verify its state. Command idempotency protects retries; operator observation
   protects the physical floor from repeating completed work.
6. Roll back only for a release regression whose migrated database remains
   compatible. Use the recovery procedure for data damage or host loss.
7. Record cause, mitigation, affected release, and missing signal. Add the
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
