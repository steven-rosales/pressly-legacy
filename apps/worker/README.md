# Worker

The Worker runs LPMS eventual work. It claims source-neutral inbox rows through
the webhook-ingestion module, dispatches them by `source:subjectType`, and
invokes injected downstream capabilities. The initial `cents:order` consumer
translates Cents data into Production's canonical `ApplyOrderDemand` command.

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
- Production and inbox completion commit in separate module-owned
  transactions. A stable `webhook:<event-id>` Production idempotency key closes
  the crash window between them.
- Crash-after-Production-commit redelivery is an idempotent no-op followed by
  inbox completion.
- Reconciliation uses the same generic ingestion and consumer path when an
  authoritative Cents read API is available; unsupported reconciliation is
  reported plainly.
- A database outage is retried with bounded loop-level backoff. The heartbeat
  intentionally becomes stale until a complete database pass succeeds again.
- Counters are emitted to Sentry Metrics for work, retries, dead letters,
  recovered or lost leases, and loop failures. Backlog age, backlog depth, and
  processing latency are exported at a bounded interval rather than once per
  poll. Metric attributes contain only bounded operational labels; event,
  order, worker, and customer identifiers are never exported.
- A successful complete inbox pass writes the local healthcheck file. At most
  once per minute it also sends an `ok` check-in to the
  `pressly-worker-heartbeat` Sentry Cron monitor. Database or loop failures stop
  both heartbeats, allowing the container healthcheck and Sentry to detect the
  same loss of progress.

Automatic Cents reconciliation remains disabled until Cents verifies a
read-updated-orders API. The launch fallback is bounded operator replay of an
inspectable dead event through webhook ingestion; replay must never mutate
Production tables directly.

Authorized operators inspect minimized event metadata at
`GET /webhook-ingestion/dead-letters` and replay one event at
`POST /webhook-ingestion/dead-letters/:eventId/replay` with the explicit
`replay-dead-webhook-event` confirmation. Replay only queues the generic event;
the Worker then dispatches it through the same consumer and Production command.

## Production alerts

The Worker emits the signals, but repository code cannot create your Sentry
notification routes. An operator must connect the Cron monitor and metric
alerts to the production on-call destination and confirm that Metrics and
Crons are enabled for the Sentry project. Start with these exact rules:

| Signal                                    | Recommended alert                                                                                                                                        |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pressly-worker-heartbeat` Cron           | Alert on one missed check-in. The SDK declares a 1-minute schedule and 1-minute grace margin; recover after one successful check-in.                     |
| `worker.inbox_oldest_pending_age_seconds` | Warning when `max >= 120` for 5 minutes; critical when `max >= 300` for 5 minutes.                                                                       |
| `worker.inbox_pending_count`              | Warning when `min >= 1` for 10 minutes.                                                                                                                  |
| `worker.jobs_retried`                     | Warning when `sum >= 5` over 10 minutes.                                                                                                                 |
| `worker.dead_letters`                     | Critical when `sum >= 1` over 5 minutes.                                                                                                                 |
| `worker.lease_losses`                     | Critical when `sum >= 1` over 5 minutes.                                                                                                                 |
| `worker.loop_failures`                    | Critical when `sum >= 1` over 5 minutes. Keep the existing Sentry issue alert for captured `inbox_loop` and `worker_runtime` exceptions enabled as well. |

Validate the production wiring in staging before launch:

1. Run the Worker with staging `SENTRY_DSN`, `SENTRY_ENABLED=true`, and a staging
   database. Confirm the Cron monitor and both inbox gauges appear within 90
   seconds.
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
