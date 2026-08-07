# Worker

The Worker runs LPMS eventual work. It claims source-neutral inbox rows through
the webhook-ingestion module, dispatches them by `source:subjectType`, and
invokes injected downstream capabilities. The Cents adapter may submit one
immutable incoming-Order candidate from an exact `SUBMITTED` observation.
Exact `COMPLETED` or `CANCELED` observations close only an unresolved candidate
or record an exact-identity tombstone; all other Cents states are durably
acknowledged without reaching canonical Users, Orders, or Production. Only an
operator acceptance creates canonical work. Orders then emits a versioned
outbox event in the same transaction, and a separate source-neutral job
projects the unreleased wash-and-fold fulfillment demand into Production.

```txt
src/main.ts
  -> bootstrap/   module and job composition
  -> jobs/        durable inbox processing and demand projection
  -> runtime/     polling, retry, heartbeat, cancellation, observability
```

Runtime mechanics do not know Cents or LPMS. Vendor handlers are private to the
webhook-inbox job, and jobs never import peer jobs.

## Run

Copy `.env.example` to `.env.local`, set `FEATURE_JOBS_ENABLED=true`, then run:

```bash
pnpm --filter @pressly/worker dev
```

Production startup fails closed unless jobs and Sentry are enabled and Sentry
has a DSN. The worker writes a private heartbeat file after each successful
inbox pass. Its container healthcheck fails when that file is missing or stale;
the worker exposes no HTTP route or host port.

## Semantics

- Expired processing leases are reclaimable after a crash.
- Transient failures use bounded exponential backoff with jitter.
- Permanent failures and exhausted retries remain inspectable as dead rows.
- Candidate creation is idempotent by exact source and external Order identity.
  A candidate acceptance, canonical Order, unreleased fulfillment, command
  receipt, source evidence, and integration outbox event commit in one
  Orders-owned transaction. Inbox completion is a separate ingestion-owned
  transaction, so a crash can safely replay the candidate submission.
- A terminal observation is idempotent on that same exact identity. It cannot
  close a restored, accepted, or rejected candidate. A terminal-before-
  submitted tombstone prevents delayed delivery from resurrecting old work.
- A manager may restore a source-closed candidate for review. The distinct
  manager-owned state is immune to later source-terminal observations.
- The fulfillment-demand projector uses a stable outbox-event idempotency key;
  a crash after Production commits is an idempotent no-op on redelivery.
- `READY_FOR_PICKUP`, `PICKED_UP`, `IN_PROGRESS`, unknown Order states, Cents
  customer events, and Cents marketing events do not create or update
  canonical work. The Worker carries no source-authority or automatic-
  reconciliation subsystem.
- After acceptance, a source-terminal observation can only ask a named
  Pressly automation to evaluate the canonical fulfillment. Production owns
  the resolution graph and guard; participating or review-sensitive work
  remains unchanged.
- A database outage is retried with bounded loop-level backoff. The heartbeat
  intentionally becomes stale until a complete database pass succeeds again.
- Application logs go directly to Sentry Logs. Docker output is limited to
  initialization failures, synchronous error/fatal writer fallbacks, final
  flush failures, and the local Sentry-disabled development logger; it is not
  a mirror of an asynchronous Sentry outage.
- Typed counters, gauges, and distributions are emitted to Sentry for work,
  named-job passes, transactions, retries, dead letters, recovered or lost
  leases, and loop failures. Inbox and Orders-outbox age/depth use one
  aggregate query per queue per minute. Metric attributes contain only bounded
  operational labels; event, order, worker, and customer identifiers are never
  exported.
- Every named job gets a `worker.job` span. Busy and failed pass metrics are
  complete; successful idle pass metrics are sampled at most once per minute.
  The wrapper observes duration and batch size but never retries, dead-letters,
  or interprets a business result.
- A successful complete inbox pass writes the local healthcheck file. At most
  once per minute it also sends an `ok` check-in to the
  `pressly-worker-progress` Sentry Cron monitor. Database or loop failures stop
  both heartbeats, allowing the container healthcheck and Sentry to detect the
  same loss of progress.

Authorized operators inspect minimized event metadata at
`GET /webhook-ingestion/dead-letters` and replay one event at
`POST /webhook-ingestion/dead-letters/:eventId/replay` with the explicit
`replay-dead-webhook-event` confirmation. Replay only queues the generic event;
the Worker then dispatches it through the same submitted-candidate boundary.

## Production alerts

The Worker emits the signals, but repository code cannot create your Sentry
notification routes. An operator must connect the Cron monitor and metric
alerts to the production on-call destination and confirm that Metrics and
Crons are enabled for the Sentry project. Start with these exact rules:

| Signal                                     | Recommended alert                                                                                                                                         |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pressly-worker-progress` Cron             | Alert on one missed check-in. The SDK declares a 1-minute schedule and 1-minute grace margin; recover after one successful check-in.                      |
| `worker.inbox_oldest_pending_age_seconds`  | Warning when `max >= 120` for 5 minutes; critical when `max >= 300` for 5 minutes.                                                                        |
| `worker.inbox_pending_count`               | Warning when `min >= 1` for 10 minutes.                                                                                                                   |
| `worker.outbox_oldest_pending_age_seconds` | Warning when `max >= 120` for 5 minutes; critical when `max >= 300` for 5 minutes.                                                                        |
| `worker.outbox_pending_count`              | Warning when `min >= 1` for 10 minutes.                                                                                                                   |
| `worker.job_passes{outcome:failed}`        | Critical when `sum >= 1` over 5 minutes.                                                                                                                  |
| `worker.jobs_retried`                      | Warning when `sum >= 5` over 10 minutes.                                                                                                                  |
| `worker.dead_letters`                      | Critical when `sum >= 1` over 5 minutes.                                                                                                                  |
| `worker.lease_losses`                      | Critical when `sum >= 1` over 5 minutes.                                                                                                                  |
| `worker.loop_failures`                     | Critical when `sum >= 1` over 5 minutes. Keep the existing Sentry issue alert for captured `worker_loop` and `worker_runtime` exceptions enabled as well. |

Validate the production wiring in staging before launch:

1. Run the Worker with staging `SENTRY_DSN`, `SENTRY_ENABLED=true`, and a staging
   database. Confirm the Cron monitor, both inbox gauges, both Orders-outbox
   gauges, and named-job spans appear within 90 seconds.
2. Stop the Worker for more than 2 minutes and confirm the missed-check-in
   notification reaches the on-call destination; restart it and confirm
   recovery.
3. Remove database connectivity for one poll and confirm both
   `worker.loop_failures` and the captured `inbox_loop` issue arrive. Restore
   connectivity and confirm heartbeat recovery.
4. With staging-only events, force at least five transient retries within 10
   minutes, one dead letter, and one reclaimed-lease race. Confirm the three
   corresponding metric alerts and verify no event or order identifier
   appears in metric attributes.

## Verify

```bash
pnpm --filter @pressly/worker test
pnpm --filter @pressly/worker typecheck
pnpm --filter @pressly/worker lint
pnpm test:lpms:int
```
