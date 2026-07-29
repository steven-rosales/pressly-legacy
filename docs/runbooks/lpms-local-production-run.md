# Local LPMS Production-Run Simulation

Use this runbook to move synthetic Cents submitted candidates through explicit
Pressly acceptance and the local Processor without resetting the shared
development database.

The acceptance fixture is:

```text
15 orders
800 lb
34 bags
3 priority orders
```

The scheduler derives batch count from the location's current immutable
configuration, shift staffing, and active machine capacity. Do not change those
facts merely to force a particular batch count.

## Safety Boundary

- Use only the native WSL Docker daemon and the existing local development
  volume.
- Never run `docker compose down -v`, delete the Postgres volume, or reset the
  shared database for this proof.
- Use a generated local HMAC key and synthetic order identifiers.
- Never paste a production Cents key, customer payload, bearer token, or
  production URL into Postman.
- Use a new shift and a new run tag for every repetition. One production run
  belongs to one shift.

## 1. Confirm the Local Runtime

From WSL:

```bash
docker context use default
docker info --format '{{.Name}} {{.DockerRootDir}}'
```

The daemon name should be the WSL host and the root directory must be
`/var/lib/docker`. Then start the stack:

```bash
pnpm docker:up
```

`pnpm docker:up` performs the same daemon guard before it touches Compose. It
returns after the detached services pass their health gates.

Open:

```text
Processor: http://localhost:4173
API:       http://localhost:4000
```

Sign in to Processor as the local owner or admin. If ingress is not configured,
complete [Cents Webhook Local Proof](./cents-webhook.md) through its Postman
setup section first.

## 2. Use a Unique Fixture

Choose a run tag that has never been sent to this database:

```text
lpms-sim-YYYYMMDD-HHMM
```

Use the tag in every synthetic Cents `order.id`, for example
`lpms-sim-YYYYMMDD-HHMM-01`.

| Order     |     Weight |   Bags | Priority |
| --------- | ---------: | -----: | :------: |
| 01        |      80 lb |      4 |   Yes    |
| 02        |      75 lb |      3 |    No    |
| 03        |      70 lb |      3 |    No    |
| 04        |      68 lb |      3 |    No    |
| 05        |      65 lb |      3 |    No    |
| 06        |      62 lb |      3 |    No    |
| 07        |      58 lb |      3 |   Yes    |
| 08        |      55 lb |      2 |    No    |
| 09        |      52 lb |      2 |    No    |
| 10        |      50 lb |      2 |    No    |
| 11        |      48 lb |      2 |    No    |
| 12        |      42 lb |      1 |    No    |
| 13        |      30 lb |      1 |   Yes    |
| 14        |      25 lb |      1 |    No    |
| 15        |      20 lb |      1 |    No    |
| **Total** | **800 lb** | **34** |  **3**   |

Give all 15 orders the same due date so weight and priority, rather than due
bucket differences, determine this fixture's packing order.

## 3. Send the Cents-Shaped Orders

In the imported Postman collection, duplicate `05 - Accept order event` 15
times. Do not run the negative authentication cases as part of this workload.

For each copy:

1. Set `order.id` to the unique run tag plus the two-digit order number.
2. Keep `order.storeId` as `{{cents_test_store_id}}`.
3. Keep `order.status` as the exact value `SUBMITTED`. `COMPLETED` and
   `CANCELED` close unresolved candidates; every other Cents status is
   acknowledged as evidence only.
4. Set one shared `dueDate` on the shift's local due-day bucket.
5. Give each order a distinct, current `updatedAt` value.
6. Set the service `quantity` to the table weight for readable test data.
7. Keep `unitCost` at `2.00` and set `totalPrice` to weight × 2.

Example for the 80 lb order:

```json
{
  "action": "order_updated",
  "order": {
    "id": "lpms-sim-YYYYMMDD-HHMM-01",
    "storeId": "{{cents_test_store_id}}",
    "status": "SUBMITTED",
    "dueDate": "<shared-due-date-iso>",
    "updatedAt": "<current-unique-iso>"
  },
  "services": [
    {
      "id": "synthetic-service-wash-fold",
      "name": "Wash and Fold",
      "quantity": 80,
      "totalPrice": "160.00",
      "unitCost": "2.00",
      "serviceCategory": "Wash and Fold",
      "serviceCategoryType": "LAUNDRY"
    }
  ]
}
```

The Worker derives estimated pounds from `totalPrice / unitCost`; `quantity`
alone does not establish the LPMS weight.

Send each request and require:

```text
HTTP 202
data.status = pending
data.duplicate = false
```

The Worker turns each new exact submission into one immutable incoming
candidate.
It does not create canonical Orders or Production work. Let the SSE-driven
Processor refresh from the authoritative API. If candidates do not appear,
inspect service health once with `pnpm docker:logs`; do not create a manual
refresh loop.

## 4. Add the Incoming Candidates to Pressly

Open **Manage Orders → Incoming** and verify the 15 candidate rows by the unique
run tag. For each candidate:

1. Confirm the synthetic order identity, reported time, due time, and estimated
   demand.
2. Select **Add to Pressly**.
3. Confirm the acceptance reason.
4. Verify the row leaves Incoming and one canonical Order becomes available
   for Intake.

Acceptance is the authoritative boundary. It creates the canonical Order and
an **unreleased** wash-and-fold fulfillment; the signed Cents delivery alone
does not. Use **Reject** only for a candidate that should create no canonical
work.

Stop if a candidate is missing, duplicated, already decided, or belongs to
another run tag. Do not resend a different status to repair it: later Cents
events cannot update accepted Order fields or reopen decided candidate states.

## 5. Record Intake and Priority

In Processor's Intake workspace, process each matching accepted Order:

1. Mark orders 01, 07, and 13 as priority.
2. Enter the bag count from the table.
3. Confirm the intake command.
4. Explicitly release each verified fulfillment to Production.
5. Verify the row becomes eligible before moving on.

Before computing, verify the workspace totals are exactly 15 orders, 800 lb,
34 bags, and 3 priority orders. Stop if another synthetic or real-looking order
has entered the eligible set; Compute intentionally snapshots every eligible
order at the location.

## 6. Prepare a Viable Shift

Review the displayed scheduler configuration and pulse capacity before
creating the shift. The capacity must be positive and no individual order may
exceed it. Do not publish a new configuration solely to make this fixture
produce a preferred number of batches; configuration publication is a durable
operational assertion, not test setup.

Create a new shift for this proof:

- Start at or slightly before the current time. Production cannot start before
  the shift begins.
- End after the proposal's projected completion, with enough operational
  buffer for the manual exercise. If the plan overflows, review and explicitly
  accept the exact overtime proposal instead of silently extending history.
- Use `America/New_York` unless the location configuration says otherwise.

Do not reuse a completed shift or a shift that already owns a production run.

## 7. Compute, Accept, and Start

Use the single scheduling workflow:

1. **Compute** against the new shift and current scheduler configuration.
2. **Review** the complete eligible snapshot and warnings.
3. **Accept** the current proposal.
4. **Start** the accepted proposal.

As an optional deterministic cross-check, a 140 lb pulse packs this exact
priority and weight fixture as:

| Batch | Orders by weight | Weight | Bags |
| ----- | ---------------- | -----: | ---: |
| 1     | 80 + 58          | 138 lb |    7 |
| 2     | 30 + 75 + 25     | 130 lb |    5 |
| 3     | 70 + 68          | 138 lb |    6 |
| 4     | 65 + 62          | 127 lb |    6 |
| 5     | 55 + 52 + 20     | 127 lb |    5 |
| 6     | 50 + 48 + 42     | 140 lb |    5 |

At any other capacity, a different batch count and grouping is expected. If
the proposal differs from what its displayed inputs imply, compare eligible
orders, priorities, due dates, pulse capacity, and configuration before
accepting. Do not accept a surprising plan merely to continue the proof.

Accept stores preference only. Start is the point that creates one started
production run, its batches, stages, assignments, and initial queue version.
After Start, the URL should identify the run under `/production/<run-id>` and a
reload should restore the same board.

## 8. Operate the Run

Use only actions the server exposes on the board:

1. Start the next available sorting stage. Starting a stage freezes that
   batch's membership.
2. Complete the stage after the physical simulation step.
3. If completion occurs before one configured pulse has elapsed, review and
   explicitly confirm the early-completion warning.
4. Assign washer or dryer machines in the stage drawer when the planned
   assignment needs to change.
5. Continue through sorting, washing, drying, and folding/packaging until every
   batch is complete.

A stage still cannot **start** before its planned boundary. Early-completion
confirmation does not collapse the schedule clock. For a fast clock-independent
proof of the entire state machine, run:

```bash
pnpm test:lpms:e2e
```

Do not alter database timestamps to force the manual board forward.

## 9. Verify and Repeat

The manual proof is complete when:

- all 15 synthetic orders belong to the started run;
- all run batches together total 800 lb and 34 bags;
- priority orders follow the scheduler's displayed priority placement policy;
- refresh preserves the explicit run URL and board;
- every committed stage transition survives refresh;
- the run reaches completed only after all batches complete.

To repeat the simulation, create a new run tag, 15 new order IDs, and a new
shift. Preserve the existing development database; proposal decisions and
historical runs are part of the behavior this proof is meant to exercise.
