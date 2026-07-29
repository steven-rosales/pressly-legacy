# Local Processor Empty-Slate Reset Evidence

## Evidence boundary

- This operation targets only the native-WSL local Compose runtime.
- Counts are aggregate; no customer payload, credential, or secret is recorded.
- No AWS, production deployment, test database, or durable domain memory is
  changed.

## T0 - Confirmed local target and pre-reset inventory

status: committed

The running Processor proxies `/api` to the local `api:4000` service. Both API
and Worker use `postgres:5432/pressly` on the `pressly_default` Docker network,
which resolves to `pressly-postgres-1`. The active Docker context is `default`.

Pre-reset aggregate counts:

| State                             | Count |
| --------------------------------- | ----: |
| Canonical Orders                  |    20 |
| Order fulfillments                |    20 |
| Incoming candidates               |     6 |
| Candidate terminal tombstones     |     1 |
| Production Orders                 |    19 |
| Production bags                   |    29 |
| Production shifts                 |     1 |
| Schedule runs                     |     1 |
| Production runs                   |     1 |
| Production batches                |     3 |
| Stage runs                        |    12 |
| Pending inbox or outbox work      |     0 |
| Processed retained webhook events |    27 |

The one-time migration `0034_prelaunch-processor-data-reset.sql` is not reused.
It predates the submitted-candidate tables and current observation evidence.
The exact reset procedure is captured in `reset-local-processor.sql`.

## T1 - Backup and reset

status: committed

- Local API, Worker, and Processor services were stopped before backup or
  mutation.
- A custom-format PostgreSQL backup was written to
  `/tmp/pressly-local-processor-reset-20260729T135142/pressly-before-reset.dump`.
- `pg_restore -l` accepted the backup, and its SHA-256 is
  `7d41c70ce5fa8ba04651331f78be233250104f5338b3da17cb8a207ee03605c7`.
- The guarded reset transaction required:
  - database `pressly`;
  - session environment `local_processor_reset`;
  - reset ID `processor-empty-slate-v1`; and
  - active location `pressly-one`.
- The transaction removed 20 Orders, 20 fulfillments, 6 candidates, 1
  tombstone, 20 Production demands, 19 Production Orders, 29 bags, 1 shift, 1
  schedule, 1 run, 3 batches, 12 stages, and 20 Order/run work events.
- Independent post-commit verification returned zero for every targeted
  candidate, Order, fulfillment, demand, Production, schedule, run, batch,
  stage, and Order/run work-event relation.
- Preserved local state includes 1 location, 4 stations, 44 machines, 6
  scheduler configurations, 1 source-location binding, 25 Users, 27 processed
  webhook events, 27 quarantine receipts, and 1 resource-manifest event.

The reset transaction committed successfully. Its first informational
post-commit query used the TypeScript export name `stations` rather than the
physical table name `production_stations`; the query failed after commit and
did not affect any mutation. The captured SQL was corrected, and the
independent zero-count and preserved-state verification above passed.

## V1 - Fresh candidate seed

status: committed

- Local API, Worker, and Processor were restarted from the current local
  images. All three are healthy.
- Six unique synthetic Cents `SUBMITTED` observations were sent to the real
  local `/webhooks/cents` endpoint with the retained
  `tooling-store-001 -> pressly-one` binding.
- Every request returned HTTP 202 with `status: pending` and
  `duplicate: false`.
- The Worker processed all six receipts. Processed webhook events advanced
  from 27 preserved events to 33.
- Exact post-processing counts are:

| State                                           | Count |
| ----------------------------------------------- | ----: |
| Seeded incoming candidates                      |     6 |
| Seeded candidates in `pending`                  |     6 |
| Canonical Orders                                |     0 |
| Order fulfillments                              |     0 |
| Production Orders                               |     0 |
| Production shifts, schedules, runs, and batches |     0 |
| Unprocessed seeded webhook events               |     0 |

The visible Processor slate now begins at the intended authority boundary:
six Incoming candidates are available for manager Accept or Reject, and no
canonical or Production work exists until one is accepted.
