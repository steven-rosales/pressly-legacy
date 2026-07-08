# Laundry Processing Management System Data Model

A Laundry Processing Management System (LPMS) helps wash-and-fold businesses process dirty laundry through:

```text
queued -> sorting -> washing -> drying -> folding + packaging -> finished
```

The system is primarily a production flow-leveling system. For v1, it should behave more like a deterministic heijunka scheduler than a deep combinatorial optimizer. The CRM/vendor webhook data is treated as external demand. The LPMS production model is the internal authority for scheduling and physical execution.

## Modeling Principles

- Store every inbound CRM webhook payload for auditability and replay.
- Normalize only the CRM fields the system actually needs.
- Treat CRM data as external demand, not production truth.
- Treat a Cents order with latest status `IN_PROGRESS` as eligible for LPMS production.
- Treat scheduler output as a proposal.
- Treat `schedule_run` as an immutable proposal.
- Treat `production_run`, `production_batch`, `stage_run`, and versioned production records as operational truth.
- Treat `work_event` as the authoritative mutation ledger and audit trail, not as full event sourcing in v1.
- Prefer consistency over availability for production writes.
- Keep v1 scoped to wash-and-fold production only.
- Keep orders together in v1: an order can have many bags, but all bags for one order must remain in the same production batch.
- Do not assign individual bags to machines. Machine usage is modeled at the stage level.
- Allow a production batch to use many washers or dryers inside one stage.
- Allow at most one active production batch per stage kind in v1.
- Treat stage completion as operator-confirmed operational truth, not hardware sensor truth.

## Plan And Execution Split

The LPMS has two different concepts that must stay separate:

```text
schedule_run = scheduler proposal
production_run = accepted execution instance
```

The system may create many `schedule_run` records without starting production. A `schedule_run` stores the scheduler input snapshot, output plan, hashes, score, and warnings. It is a proposal until an operator accepts it.

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

## CRM Webhook Mirror

These tables represent data received from the CRM/vendor. They should remain separate from the production scheduling model.

For v1, Cents is the external order authority. The LPMS should treat the latest projected Cents order state as production-eligible only when:

```text
crm_orders.status = IN_PROGRESS
```

This is an LPMS policy over the CRM projection. It is not the same thing as trusting one webhook delivery in isolation.

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
- payload_jsonb
- received_at
- processed_at
- status
- error_message
```

Recommended constraints:

```text
unique(vendor, dedupe_key)
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
- updated_at
- completed_at
- raw_jsonb
```

Recommended constraints:

```text
unique(external_order_id)
```

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
- employee_count
- created_at
- updated_at
```

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

Folding / packaging:
- 3 folding stations
- manufacturer_capacity_lbs = null
- effective_capacity_lbs = null
```

Washer scheduling should use `effective_capacity_lbs`, not manufacturer capacity. The initial policy should leave a 3-5 lb safety margin below manufacturer capacity to avoid quality issues from overloaded machines.

### `scheduler_config`

Versioned scheduler configuration.

```text
scheduler_config
- id
- batch_minutes
- min_batch_minutes
- fold_lbs_per_employee_minute
- sorting_max_minutes
- washer_minutes
- dryer_min_minutes
- dryer_max_minutes
- folding_packaging_minutes
- active_batches_per_stage_kind
- algorithm_version
- version
- created_at
- updated_at
```

Do not store physical machine counts here. Machine capacity should come from active `machine` records.

Initial v1 policy:

```text
batch_minutes = 56
min_batch_minutes = 50
fold_lbs_per_employee_minute = configurable, initially 1.5
washer_minutes = 32
dryer_min_minutes = 40
dryer_max_minutes = 50
folding_packaging_minutes = 56
active_batches_per_stage_kind = 1
```

The target batch weight is derived from folding capacity:

```text
target_batch_weight_lbs = fold_lbs_per_employee_minute * employee_count * batch_minutes
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
- schedule_score
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
The input_snapshot, output_plan, hashes, algorithm_version, schedule_score, and warnings are immutable after creation.
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
- target_weight_lbs
- derived_weight_lbs
- batch_minutes
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

## Scheduler Boundary

The scheduler should live behind a stable boundary.

For v1, implement a deterministic heijunka-style scheduler in TypeScript. The first goal is to validate the model, invariants, inputs, and operator workflow.

After the model stabilizes, a Rust solver exposed through napi-rs can replace the TypeScript implementation without changing the application boundary.

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
build batches around target_batch_weight_lbs
sequence batches through queued -> sorting -> washing -> drying -> folding_packaging -> finished
assign washer and dryer machines by effective_capacity_lbs
preserve one-active-batch-per-stage-kind
```

The scheduler returns a proposal:

```text
production_batches
stage_runs
stage_machine_assignments
forecasts
schedule_score
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
  scheduleScore,
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
There is no washer/dryer hardware integration in v1.
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
A machine cannot have overlapping active stage_machine_assignments.
Washer scheduling uses effective_capacity_lbs, not manufacturer_capacity_lbs.
batch_minutes must be at least 50.
target_batch_weight_lbs is derived from fold_lbs_per_employee_minute * employee_count * batch_minutes.
Weight is derived from Cents service pricing in v1.
Finished means folding and packaging are complete.
Stage completion is operator-confirmed, not hardware-confirmed.
schedule_run input and output snapshots are immutable after creation.
Accepting a schedule_run creates exactly one production_run.
production_run execution records are mutable only through versioned commands.
Manual overrides require expected version checks.
Webhook events are idempotent.
The scheduler cannot mutate execution state directly.
work_event is the authoritative mutation ledger and audit trail.
Operational tables are the current-state projections for reads.
```
