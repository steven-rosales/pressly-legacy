# Laundry Processing Management System Design

A Laundry Processing Management System (LPMS) helps wash-and-fold businesses process dirty laundry through:

```text
queued -> sorting -> washing -> drying -> folding + packaging -> finished
```

The system is primarily a production flow-leveling system. For v1, it should behave more like a deterministic heijunka scheduler than a deep combinatorial optimizer. `laundry-production` is the business domain; LPMS is the application that operates it.

CRM/vendor webhook data is external demand. The LPMS production model is the internal authority for scheduling and physical execution.

## Modeling Principles

- Store every inbound CRM webhook payload for auditability and replay.
- Acknowledge a webhook only after its raw payload is stored durably.
- Process webhooks at least once and make projection idempotent.
- Normalize only the CRM fields the system actually needs.
- Treat CRM data as external demand, not production truth.
- Treat a Cents order with latest status `IN_PROGRESS` as eligible for LPMS production.
- Treat scheduler output as a proposal.
- Treat `schedule_run` as an immutable proposal.
- Treat `production_run`, `production_batch`, `stage_run`, and versioned production records as operational truth.
- Treat `work_event` as the authoritative mutation ledger and audit trail, not as full event sourcing in v1.
- Prefer consistency over availability for production writes.
- Use workers for projection, retries, reconciliation, and other eventually consistent work. Workers do not own production-floor invariants.
- Keep v1 scoped to wash-and-fold production only.
- Keep orders together in v1: an order can have many bags, but all bags for one order must remain in the same production batch.
- Do not assign individual bags to machines. Machine usage is modeled at the stage level.
- Allow a production batch to use many washers or dryers inside one stage.
- Allow at most one active production batch per stage kind in v1.
- Use one configurable `pulse_minutes` value for every production stage. A
  batch occupies sorting, washing, drying, and folding/packaging for one full
  pulse each and advances only at pulse boundaries.
- Treat stage completion as operator-confirmed operational truth, not hardware sensor truth.

## Plan And Execution Split

The LPMS has two different concepts that must stay separate:

```text
schedule_run = scheduler proposal
production_run = accepted execution instance
```

The system may create many `schedule_run` records without starting production. A `schedule_run` stores the scheduler input snapshot, output plan, hashes, pulse capacity, makespan, completion forecast, and warnings. It is a proposal until an operator accepts it.

When an operator accepts a `schedule_run`, the system creates a `production_run` plus concrete `production_batch`, `production_batch_order`, `stage_run`, and `stage_machine_assignment` records. Those records represent the real production floor.

Important consequence:

```text
Plan records are immutable.
Execution records are mutable through versioned commands and work_event rows.
```

The command path should be:

```text
command
-> validate invariants
-> insert work_event
-> update operational tables
-> commit transaction
```

This gives auditability, idempotency, replay potential, and current-state reads without requiring a fully event-sourced v1.

## Consistency And Availability

Consistency and availability are chosen per operation.

| Operation                      | Model                                  | Failure behavior                                                 |
| ------------------------------ | -------------------------------------- | ---------------------------------------------------------------- |
| Receive a Cents webhook        | Durable, availability-oriented receipt | Return a non-success response unless the event is durably stored |
| Project Cents order data       | Eventually consistent                  | Retry safely; dead-letter permanent failures                     |
| Generate a schedule proposal   | Pure and deterministic                 | Retry without changing execution state                           |
| Accept a schedule proposal     | Strongly consistent transaction        | Commit once or fail without creating partial execution records   |
| Advance or override production | Strongly consistent transaction        | Validate versions and invariants, then commit once or fail       |
| Read the production board      | Current-state projection               | Slight read staleness is acceptable; invented state is not       |

Commands that start, advance, assign, or override physical production must not be queued for later success. If the database cannot prove the command is valid, the command fails and the operator retries.

## CRM Webhook Mirror

These tables represent data received from the CRM/vendor. They should remain separate from the production scheduling model.

For v1, Cents is the external order authority. The LPMS should treat the latest projected Cents order state as production-eligible only when:

```text
crm_orders.status = IN_PROGRESS
```

This is an LPMS policy over the CRM projection. It is not the same thing as trusting one webhook delivery in isolation.

### Delivery And Projection Flow

For v1, `webhook_events` is a Postgres-backed durable inbox and logical queue. A separate message broker is not required for expected volume.

```text
Cents webhook
-> API verifies the vendor request and validates the envelope
-> insert webhook_events(status = pending)
-> commit
-> return a success response

apps/worker
-> claim pending events with a recoverable lease
-> invoke the CRM projection use case
-> update crm_orders and derived production eligibility
-> mark the event processed in the same transaction
```

The API must not decide whether an event is a useful state change before durable receipt. Status, due date, weight inputs, or other scheduling data can change independently.

The worker provides at-least-once processing:

- Claim ready events with `FOR UPDATE SKIP LOCKED`.
- Reclaim an event after its worker lease expires.
- Retry transient database, network, and lock failures with bounded exponential backoff and jitter.
- Mark permanently invalid events as `dead` and alert for manual review.
- Keep projection logic in an application use case. The worker is a runtime adapter, not the owner of business rules.

An independent reconciliation job should periodically read Cents orders updated since a stored watermark and send newer snapshots through the same projection use case. This closes the gap when a webhook was never delivered. If Cents does not expose the required read API, the system cannot promise automatic recovery from an event it never received; manual replay and operational review become the fallback.

Request authentication must follow the actual Cents contract. If Cents supplies a signing secret, verify the signature against the raw request body before JSON parsing and use constant-time comparison. IP allowlisting is defense in depth, not the primary authenticity guarantee.

### `webhook_events`

Stores every inbound webhook event.

```text
webhook_events
- id
- vendor
- action
- external_event_id
- dedupe_key
- external_order_id
- external_updated_at
- payload_jsonb
- received_at
- available_at
- locked_until
- locked_by
- attempt_count
- processed_at
- dead_lettered_at
- status
- last_error
```

Valid statuses:

```text
pending
processing
processed
dead
```

Recommended constraints:

```text
unique(vendor, dedupe_key)
index(status, available_at)
```

If the vendor does not provide a reliable event id, compute:

```text
dedupe_key = hash(vendor + action + external_order_id + external_updated_at + payload_hash)
```

### `crm_orders`

Normalized projection of the vendor order.

```text
crm_orders
- id
- external_order_id
- store_id
- customer_id
- status
- order_code
- order_type
- order_total_cents
- tip_amount_cents
- credit_amount_cents
- promotion_amount_cents
- balance_due_cents
- return_method
- pickup_delivery_fee_cents
- return_delivery_fee_cents
- due_at
- placed_at
- source_updated_at
- projected_at
- completed_at
- raw_jsonb
```

Recommended constraints:

```text
unique(external_order_id)
```

Projection ordering is based on vendor state, not arrival order:

```text
Apply an incoming snapshot only when its source_updated_at is newer.
received_at never decides which vendor state wins.
Equal source versions with different payloads require reconciliation.
```

The CRM mirror may move across statuses that would be invalid in the internal production state machine. Preserve the latest canonical external fact, then apply LPMS eligibility policy over it. Strict transition enforcement belongs to `production_run`, `production_batch`, and `stage_run`.

### `crm_order_services`

Normalized projection of `services[]`.

```text
crm_order_services
- id
- crm_order_id
- external_service_id
- name
- quantity
- total_price_cents
- unit_price_cents
- service_category
- service_category_type
- customer_selection
```

For v1, LPMS derives production weight from Cents laundry service pricing:

```text
derived_weight_lbs = service.total_price / service.unit_price
```

If the payload uses a vendor-specific name such as `unitCost`, map it into the normalized unit price field before deriving weight. Bag-level weighing can be added later, but v1 should not pretend that bag-level measured weights exist.

### `crm_order_service_modifiers`

Normalized projection of `services[].modifiers[]`.

```text
crm_order_service_modifiers
- id
- crm_order_service_id
- external_modifier_id
- name
- pricing_type
- quantity
- total_price_cents
- unit_price_cents
```

### `crm_customers`

Normalized projection of customer identity.

```text
crm_customers
- id
- external_customer_id
- cents_customer_id
- first_name
- last_name
- phone_number
- email
- business_name
- is_commercial
- is_invoice_enabled
- referral_code
- updated_at
```

Recommended constraints:

```text
unique(external_customer_id)
```

### `crm_customer_metrics_snapshot`

Point-in-time customer metrics captured from the webhook.

```text
crm_customer_metrics_snapshot
- id
- crm_order_id
- num_orders
- total_order_value_cents
- last_order_at
- credit_balance_cents
- loyalty_points_balance
- captured_at
```

### `crm_order_windows`

Pickup and return windows from the vendor.

```text
crm_order_windows
- id
- crm_order_id
- pickup_start_at
- pickup_end_at
- return_start_at
- return_end_at
- formatted_pickup_window
- formatted_return_window
```

## LPMS Production Model

These tables represent internal production planning and physical execution. Planning records describe what the scheduler proposed. Execution records describe what operators are actually doing.

### `production_shift`

Represents a production window.

```text
production_shift
- id
- starts_at
- ends_at
- timezone
- status
- effective_folder_count
- created_at
- updated_at
```

`effective_folder_count` means workers assigned to sustained folding work for
that shift, not everyone clocked in. Other labor must still cover sorting,
machine loading, movement, and packaging support for the forecast to hold.

### `production_order`

Internal LPMS view of a CRM order that can be scheduled for production.

```text
production_order
- id
- crm_order_id
- due_at
- priority
- status
- derived_weight_lbs
- derived_weight_source
- must_stay_together
- eligible_at
- finished_at
- created_at
- updated_at
```

Recommended constraints:

```text
unique(crm_order_id)
```

For v1:

```text
crm_orders.status must be IN_PROGRESS before the production_order can be scheduled.
must_stay_together = true
derived_weight_source = cents_service_price
```

### `bag`

A logical production unit under an order. This is not an RFID-tracked or individually machine-assigned object. V1 can keep this lightweight because order weight is derived from Cents, not from bag-level weighing.

```text
bag
- id
- production_order_id
- bag_index
- recorded_weight_lbs
- service_type
- status
```

Recommended constraints:

```text
unique(production_order_id, bag_index)
```

Important v1 rule:

```text
All bags for one production_order must stay in the same production_batch.
recorded_weight_lbs is nullable in v1.
```

### `station`

Represents a process step.

```text
station
- id
- kind
- label
- sort_order
- is_active
```

Initial station kinds:

```text
sorting
washing
drying
folding_packaging
```

Sorting is tracked as a stage, but it does not require physical machine assignment in v1.

### `machine`

Represents a physical constrained resource.

```text
machine
- id
- station_id
- label
- manufacturer_capacity_lbs
- effective_capacity_lbs
- capacity_safety_margin_lbs
- is_active
```

Initial machine inventory:

```text
Washers:
- 11 machines with 20 lb manufacturer capacity
- 7 machines with 40 lb manufacturer capacity
- 4 machines with 60 lb manufacturer capacity

Dryers:
- 22 machines with 40 lb manufacturer capacity
- 30 lb effective capacity per machine for initial planning

Folding / packaging:
- 3 folding stations
- manufacturer_capacity_lbs = null
- effective_capacity_lbs = null
```

Scheduling uses `effective_capacity_lbs`, not manufacturer capacity. The
initial washer example uses a 3 lb safety margin on each of 22 machines, giving
`740 - 66 = 674 lb` effective fleet capacity. The initial dryer example uses
`22 * 30 = 660 lb` effective fleet capacity. These values remain machine data,
not scheduler configuration.

### `scheduler_config`

Versioned scheduler configuration.

```text
scheduler_config
- id
- pulse_minutes
- fold_lbs_per_folder_minute
- algorithm_version
- version
- created_at
- updated_at
```

`pulse_minutes` is configurable and is the single scheduling clock. Every
planned `stage_run` lasts exactly one pulse. A machine finishing its physical
cycle early does not shorten that stage or move the batch early; the unused
time is operational buffer that keeps the production batch synchronized.

Do not store physical machine counts or effective machine capacity here. Those
come from active `machine` records. Do not store separate sorting, washer,
dryer, or folding schedule durations because doing so would create competing
clocks and break pulse alignment.

Initial v1 policy:

```text
pulse_minutes = configurable, initially 56
fold_lbs_per_folder_minute = configurable, initially 2
```

Both configured values must be positive. Publishing a pulse configuration also
requires an operational assertion that sorting, washing, and drying can each
finish their physical work inside that pulse. The scheduler still reserves the
full pulse for every stage.

At most one active batch per stage kind remains a v1 invariant, not a
configuration knob. Supporting parallel batches would change the production
model and require a different scheduler. Published configuration versions are
immutable once referenced by a `schedule_run`.

The scheduler derives capacity rather than storing a guessed batch weight:

```text
folding_capacity_lbs =
  fold_lbs_per_folder_minute * effective_folder_count * pulse_minutes

pulse_capacity_lbs = min(
  sum(active washer effective_capacity_lbs),
  sum(active dryer effective_capacity_lbs),
  folding_capacity_lbs
)
```

### `schedule_run`

Represents one scheduling attempt. This is a scheduler proposal, not the production floor.

```text
schedule_run
- id
- production_shift_id
- scheduler_config_id
- status
- input_snapshot
- input_snapshot_hash
- output_plan
- output_plan_hash
- algorithm_version
- pulse_capacity_lbs
- batch_count
- makespan_minutes
- planned_completion_at
- warnings_json
- created_at
- accepted_at
- rejected_at
```

Valid statuses:

```text
draft
accepted
superseded
rejected
```

Important rule:

```text
The input snapshot, output plan, hashes, algorithm version, capacity forecast,
makespan, planned completion, and warnings are immutable after creation.
Accepting a schedule_run creates a production_run.
```

### `production_run`

Represents an accepted execution instance created from a schedule proposal.

```text
production_run
- id
- production_shift_id
- schedule_run_id
- status
- started_at
- completed_at
- version
- created_at
- updated_at
```

Recommended constraints:

```text
unique(schedule_run_id)
```

Valid statuses:

```text
planned
started
completed
canceled
```

### `production_batch`

Represents a real group of orders moving together through the production floor. A production batch is not a washer load.

```text
production_batch
- id
- production_run_id
- sequence_index
- status
- pulse_capacity_lbs
- derived_weight_lbs
- pulse_minutes
- planned_sort_start_at
- planned_wash_start_at
- planned_dry_start_at
- planned_folding_packaging_start_at
- planned_done_at
- started_at
- finished_at
- version
- created_at
- updated_at
```

Valid statuses:

```text
queued
sorting
washing
drying
folding_packaging
finished
canceled
blocked
```

Important:

```text
Orders do not split across production batches.
Orders and bags can split across machines inside a batch stage.
An underfilled production batch still occupies one complete pulse per stage.
```

### `production_batch_order`

Join table between production batches and production orders.

```text
production_batch_order
- production_batch_id
- production_order_id
```

Recommended constraints:

```text
unique(production_batch_id, production_order_id)
```

Important v1 rule:

```text
A production_order can belong to at most one active production_batch.
```

### `stage_run`

Represents one real process step for a production batch. This is the state machine owner for the physical workflow.

```text
stage_run
- id
- production_batch_id
- station_id
- status
- planned_start_at
- planned_end_at
- actual_start_at
- actual_end_at
- started_by
- completed_by
- version
- created_at
- updated_at
```

Valid statuses:

```text
planned
started
completed
blocked
canceled
```

Important:

```text
queued is a production_batch status before the first stage starts.
stage_run completion is operator-confirmed, not washer/dryer hardware-confirmed.
For v1, at most one production_batch can have an active stage_run for the same station kind.
planned_end_at - planned_start_at equals scheduler_config.pulse_minutes for every stage.
A batch advances only at a pulse boundary, even when physical work finishes early.
```

### `stage_machine_assignment`

Represents physical machines assigned to a stage. A single stage can use many machines.

```text
stage_machine_assignment
- id
- stage_run_id
- machine_id
- planned_start_at
- planned_end_at
- actual_start_at
- actual_end_at
- status
- created_at
- updated_at
```

Important rule:

```text
Do not assign bags to machines.
Sorting does not require stage_machine_assignment in v1.
```

Correct model:

```text
ProductionBatch -> StageRun -> many StageMachineAssignments -> many Machines
```

Incorrect model:

```text
Bag -> Machine
```

### `work_event`

Append-only mutation ledger for production changes.

In v1, `work_event` is authoritative for auditability, idempotency, and explaining why a production record changed. Operational tables remain the current-state projections used by normal reads.

Every production mutation should insert a `work_event` and update the affected operational table in the same database transaction.

```text
work_event
- id
- event_type
- entity_type
- entity_id
- actor_id
- expected_version
- idempotency_key
- payload_json
- created_at
```

Example event types:

```text
schedule_accepted
production_run_started
production_run_completed
production_batch_queued
production_batch_overridden
production_batch_finished
stage_started
stage_completed
stage_blocked
stage_unblocked
machine_assigned
machine_unassigned
order_removed_from_production_batch
machine_breakdown_reported
bag_marked_missing
bag_marked_damaged
rewash_requested
canceled_order_removed
manual_hold_applied
manual_hold_released
manual_override_applied
```

### `manual_override`

Stores human-approved changes to execution data.

Manual overrides are not a separate production state. They are commands that emit `work_event` rows and update versioned operational records.

```text
manual_override
- id
- actor_id
- entity_type
- entity_id
- reason
- before_json
- after_json
- created_at
```

## Relationships

```text
webhook_events
  -> crm_orders
    -> production_order
      -> bag[]

production_shift
  -> schedule_run
    -> production_run
      -> production_batch
        -> production_batch_order
          -> production_order

production_batch
  -> stage_run
    -> stage_machine_assignment
      -> machine
        -> station
```

## Runtime Boundaries

The API is the composition boundary. It authenticates the caller or vendor request, validates transport input, and invokes the correct application use case. It does not own production rules.

```text
Laundry Processor
-> API auth, session, validation, and authorization
-> production workflow
   -> production policies
   -> scheduler boundary
   -> repositories
-> Postgres

Cents
-> API webhook authentication and validation
-> webhook_events durable inbox
-> apps/worker
-> CRM projection use case
-> Postgres

apps/worker reconciliation timer
-> Cents read API, when available
-> CRM projection use case
-> Postgres
```

Boundary responsibilities:

- `production workflow` owns transactional production commands and orchestration.
- `production policies` are pure decisions over explicit inputs.
- `optimization` is pure computation that returns a proposal and performs no database writes.
- `apps/worker` executes eventual work such as CRM projection, retries, reconciliation, and alerts.
- Postgres is the durable authority for webhook receipt, CRM projections, schedule proposals, and accepted production execution.

The worker may call the same transactional application use cases used by synchronous paths. It must not bypass invariant validation or invent a second production write model.

## BOTE Capacity Envelope

These are planning assumptions, not measured production facts. Replace them with observed percentiles after the first production period.

### Webhook Workload

Assume:

```text
100 orders/day
10 webhook events/order
25 KB average payload
```

Then:

```text
events/day = 100 * 10 = 1,000
average events/second = 1,000 / 86,400 = 0.012
100x burst = about 1.2 events/second
raw storage/day = 1,000 * 25 KB = about 25 MB
raw storage/90 days = about 2.25 GB before indexes and backups
```

A single worker processing 20 events/second would drain a six-hour average backlog of 250 events in about 13 seconds. Throughput does not justify a separate broker for v1; durability and recovery semantics justify the inbox and worker.

### Production Throughput

#### Fixed Pulse Model

The pulse is configurable, but all stages use the same value. For an empty
four-stage pipeline:

```text
stage_count = 4

minimum_batch_count = ceil(total_weight_lbs / pulse_capacity_lbs)

makespan_minutes =
  (actual_batch_count + stage_count - 1) * pulse_minutes

completed_batches_from_empty = max(
  0,
  floor(shift_minutes / pulse_minutes) - stage_count + 1
)
```

`minimum_batch_count` is only a weight-based lower bound. Orders cannot split
across production batches, so deterministic whole-order packing may require
more batches. A single order heavier than `pulse_capacity_lbs` is unschedulable
in v1 and must be returned as an explicit warning rather than silently split.

#### 800 lb Worked Example

For the initial planning example:

```text
pulse_minutes = 56
fold_lbs_per_folder_minute = 2
effective_folder_count = 2
washer effective fleet capacity = 674 lb
dryer effective fleet capacity = 660 lb

folding capacity/pulse = 2 * 2 * 56 = 224 lb
pulse_capacity_lbs = min(674, 660, 224) = 224 lb
```

For `800 lb`, ideal whole-order packing produces four batches:

```text
224 lb + 224 lb + 224 lb + 128 lb = 800 lb

makespan = (4 batches + 4 stages - 1) * 56
         = 392 minutes
         = 6 hours 32 minutes
```

Starting at `10:00`, the ideal four-batch plan completes at `16:32`:

| Batch | Sorting     | Washing     | Drying      | Folding / packaging |
| ----- | ----------- | ----------- | ----------- | ------------------- |
| 1     | 10:00-10:56 | 10:56-11:52 | 11:52-12:48 | 12:48-13:44         |
| 2     | 10:56-11:52 | 11:52-12:48 | 12:48-13:44 | 13:44-14:40         |
| 3     | 11:52-12:48 | 12:48-13:44 | 13:44-14:40 | 14:40-15:36         |
| 4     | 12:48-13:44 | 13:44-14:40 | 14:40-15:36 | 15:36-16:32         |

The final `128 lb` batch still holds every stage for the full 56-minute pulse.
A six-hour window starting from an empty pipeline completes at most three
batches because the four-stage startup latency consumes the first three pulse
offsets. Its ideal nominal capacity is therefore `3 * 224 = 672 lb`, not
`floor(360 / 56) * 224`.

Folding is the initial bottleneck in this example. Replace the rate and labor
assumptions with observed percentiles after launch, but do not introduce an
optimization objective before the operation has data that can justify one.

At an initial envelope of fewer than 500 eligible orders, sorting and greedy packing are well within a single TypeScript process. Distribute solver computation only after measured latency or algorithmic complexity requires it.

## Scheduler Boundary

The scheduler should live behind a stable boundary.

For v1, implement a deterministic heijunka-style scheduler in TypeScript. The first goal is to validate the model, invariants, inputs, and operator workflow.

The v1 objective is not to search for a mathematically optimal schedule. It is
to produce the same explainable proposal from the same snapshot and config,
preserve whole orders, respect pulse capacity, and expose when the requested
work does not fit. The pure scheduler boundary permits a different
implementation later only if measured evidence justifies it.

The scheduler receives a stable snapshot:

```text
eligible_orders
bags
machines
stations
active_stage_runs
scheduler_config
production_shift
```

Eligible orders are orders whose latest CRM projection is:

```text
crm_orders.status = IN_PROGRESS
```

The v1 scheduler should:

```text
bucket orders by due today / tomorrow / later
select orders for the production run
calculate pulse_capacity_lbs from active resources, folding rate, folders, and pulse_minutes
pack whole orders deterministically into batches no heavier than pulse_capacity_lbs
create one fixed pulse slot per stage for every production batch
sequence batches through queued -> sorting -> washing -> drying -> folding_packaging -> finished
assign washer and dryer machines by effective_capacity_lbs
preserve one-active-batch-per-stage-kind
calculate batch_count, makespan_minutes, planned_completion_at, and shift overflow
return oversized or unplaced orders explicitly
```

Within each due-date bucket, v1 may use stable first-fit decreasing by order
weight with deterministic tie-breakers. This is a packing heuristic, not an
optimization claim. The scheduler never shortens the pulse to make a plan fit;
it reports the infeasibility or leaves lower-priority orders unplaced.

The scheduler returns a proposal:

```text
production_batches
stage_runs
stage_machine_assignments
forecasts
batch_count
pulse_capacity_lbs
makespan_minutes
planned_completion_at
unplaced_order_ids
warnings
```

The scheduler must not mutate production state directly.

Important:

```text
Scheduler output becomes schedule_run.output_plan.
It becomes production_run execution data only after an operator accepts the schedule_run.
```

## System Interfaces

### Create Schedule Run

Creates a persisted draft schedule proposal. This does not create execution records.

```ts
createScheduleRun({
  productionShiftId,
  schedulerConfigId,
  horizonStart,
  horizonEnd
}) -> {
  scheduleRunId,
  batchCount,
  pulseCapacityLbs,
  makespanMinutes,
  plannedCompletionAt,
  unplacedOrderIds,
  status
}
```

### Get Schedule Run

Reads a persisted schedule proposal.

```ts
getScheduleRun({
  scheduleRunId
}) -> {
  scheduleRun,
  proposedBatches,
  forecasts
}
```

### Accept Schedule Run

Accepts a draft proposal and creates the execution records.

```ts
acceptScheduleRun({
  scheduleRunId,
  expectedOutputPlanHash
}) -> {
  productionRunId,
  productionBatchIds
}
```

### Get Production Board

Reads current production state.

```ts
getProductionBoard({
  productionShiftId
}) -> {
  stageSlots,
  activeProductionBatches,
  queuedProductionBatches,
  dueTodayOrders,
  dueTomorrowOrders,
  laterOrders
}
```

### Override Production Batch

Applies a human override with optimistic concurrency.

```ts
overrideProductionBatch({
  productionBatchId,
  expectedProductionRunId,
  expectedProductionBatchVersion,
  changes,
  reason
}) -> {
  productionBatchId,
  newVersion
}
```

### Apply Work Event

Applies a production event with idempotency and version checks.

```ts
applyWorkEvent({
  eventType,
  entityId,
  expectedVersion,
  idempotencyKey,
  payload
}) -> {
  workEventId,
  newVersion
}
```

## State Machine

The physical workflow stage lifecycle is owned by `stage_run`.

The production batch exposes the current high-level flow state for fast reads. That status should be updated through commands that also create `stage_run` and `work_event` rows.

Main happy path for a production batch:

```text
queued
-> sorting
-> washing
-> drying
-> folding_packaging
-> finished
```

Main happy path for a production order:

```text
pending_eligibility
-> eligible
-> accepted_into_production_batch
-> in_production
-> finished
```

Main `stage_run.status` values:

```text
planned
started
completed
blocked
canceled
```

Exception statuses:

```text
machine_breakdown
rewash_required
missing_bag
damaged_item
canceled_order
manual_hold
```

Important:

```text
manual_override is not a state.
manual_override is a WorkEvent.
stage_run completion is operator-confirmed.
Every stage occupies one full configured pulse.
Physical work finishing early does not advance the batch before the next pulse boundary.
There is no washer/dryer hardware integration in v1.
```

## Operational Proof

The implementation is correct enough for v1 only when these failure cases are tested:

```text
Deliver the same webhook repeatedly -> one effective projection.
Deliver order snapshots out of order -> newest vendor state wins.
Stop a worker after it claims an event -> the expired lease makes the event claimable again.
Stop a worker after projection commit -> redelivery is an idempotent no-op.
Deliver a permanently invalid payload -> the event becomes dead and raises an alert.
Omit a webhook -> reconciliation restores the missing vendor state.
Race two production commands -> optimistic concurrency and constraints allow only one valid write.
Make Postgres unavailable -> production commands fail without partial state.
Schedule the same snapshot with the same config twice -> byte-equivalent plans.
Finish washer work early -> the batch remains in washing until the pulse boundary.
Pack 800 lb into four ideal whole-order batches -> makespan is 392 minutes.
Use order weights that cannot fit into four 224 lb bins -> actual batch count exceeds the weight lower bound.
Provide one order above pulse capacity -> the scheduler returns it as unplaced with a warning.
```

Minimum operational signals:

```text
webhook events received, processed, retried, and dead
age of oldest pending webhook event
worker processing latency and failure count
reconciliation watermark age and detected drift
production command conflicts and invariant failures
```

## Core Invariants

```text
A production_order is schedulable only when latest crm_orders.status is IN_PROGRESS.
A production_order can belong to at most one active production_batch.
All bags for one production_order must stay in the same production_batch.
Orders and bags can split across machines inside a production batch stage.
A bag is not assigned to a machine.
A production batch stage can be assigned to many machines.
A production batch is not a washer load.
A production batch can be active in only one stage at a time.
At most one production batch can be active per stage kind in v1.
A stage cannot start before the previous stage completes.
A stage occupies exactly one scheduler_config.pulse_minutes slot.
A production batch advances only at pulse boundaries.
Early physical completion does not shorten a stage or change downstream start times.
A machine cannot have overlapping active stage_machine_assignments.
Washer and dryer scheduling use effective_capacity_lbs, not manufacturer_capacity_lbs.
pulse_capacity_lbs is the minimum of effective washer, dryer, and folding capacity per pulse.
folding capacity is fold_lbs_per_folder_minute * effective_folder_count * pulse_minutes.
The same scheduler_config version and input snapshot produce the same schedule proposal.
The weight-based minimum batch count does not override whole-order packing.
An order heavier than pulse_capacity_lbs is unplaced in v1; it is never silently split.
Weight is derived from Cents service pricing in v1.
Finished means folding and packaging are complete.
Stage completion is operator-confirmed, not hardware-confirmed.
schedule_run input and output snapshots are immutable after creation.
Accepting a schedule_run creates exactly one production_run.
production_run execution records are mutable only through versioned commands.
Manual overrides require expected version checks.
Webhook receipt is acknowledged only after durable commit.
Webhook processing is at least once and projection is idempotent.
CRM projection ordering uses vendor source version, not arrival time.
Dead webhook events remain available for inspection and replay.
Workers cannot bypass production command invariants.
The scheduler cannot mutate execution state directly.
work_event is the authoritative mutation ledger and audit trail.
Operational tables are the current-state projections for reads.
```
