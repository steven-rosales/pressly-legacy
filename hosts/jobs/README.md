# Worker

The Worker executes Pressly's generated two-job catalog:

1. Ingress claims and processes durable external events.
2. Production applies Orders fulfillment-demand events.

The generic jobs host owns process lifecycle and durable execution. The
topology runtime binds each generated registration to its owner-controlled
durable queue, then supplies that catalog and execution platform to the host.

```text
hosts/jobs/src/main.ts
  -> generated/runtime/jobs.ts
  -> topology/src/runtime/jobs.ts
  -> topology/src/runtime/jobs/pressly-jobs.composition.ts
  -> generated/job-catalog.ts
  -> hosts/jobs
  -> Ingress and Production cells

host-owned mechanisms
  -> queue delivery, polling, retry timing, heartbeat, observation, shutdown
```

Ingress owns receipts, claims, leases, retries, dead letters, source bindings,
and Cents-to-canonical dispatch. Orders owns candidates, canonical Orders,
fulfillments, and its transactional outbox. Production owns only source-neutral
demand and floor truth. The Worker owns none of those policies.

An exact Cents `SUBMITTED` observation may submit one immutable incoming-Order
candidate. Exact `COMPLETED` or `CANCELED` observations close only an unresolved
candidate or record an exact-identity tombstone. Other states are durably
acknowledged without creating canonical Customer, Order, or Production work.
Only an operator acceptance creates canonical work; the Orders outbox then
delivers the fulfillment fact to Production.

## Run

Copy `.env.example` to `.env.local`, set `FEATURE_JOBS_ENABLED=true`, then run:

```bash
pnpm --filter @pressly/jobs-host dev
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
  Candidate acceptance, canonical Customer linkage, Order, unreleased fulfillment, command
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
pnpm --filter @pressly/jobs-host test
pnpm --filter @pressly/jobs-host typecheck
pnpm --filter @pressly/jobs-host lint
pnpm --filter @pressly/jobs-verification test
pnpm --filter @pressly/flow-verification test:postgres
pnpm test:lpms:int
```
