# Laundry Processing Management System Design

A Laundry Processing Management System (LPMS) helps wash-and-fold businesses process dirty laundry through:

```text
queued -> sorting -> washing -> drying -> folding + packaging -> finished
```

The system is primarily a production flow-leveling system. For v1, it should behave more like a deterministic heijunka scheduler than a deep combinatorial optimizer. `laundry-production` is the business domain; LPMS is the application that operates it.

External order systems provide demand. The LPMS production model is the
source-neutral internal authority for scheduling and physical execution.

## Modeling Principles

- Authenticate every inbound vendor webhook against the exact raw body bytes
  before JSON parsing or durable ingestion.
- Persist only the canonical LPMS input and a raw-body digest in the durable
  inbox. Keep full vendor payloads out of Production contracts and projections.
- Capture the exact raw receipt in a separate AES-256-GCM encrypted diagnostic
  quarantine for 30 days. The quarantine is not a replay source or product
  read model, has no public read route, and is purged independently.
- Acknowledge an order webhook only after its minimized canonical event is
  durable and its accepted quarantine receipt is linked. Authenticated
  non-production events retain only source metadata and a digest in the inbox;
  their raw receipt remains encrypted and short-lived in quarantine.
- Process ingested events at least once and make downstream commands
  idempotent.
- Normalize only the source fields the target capability actually needs.
- Treat source-system data as external demand, not production truth.
- Translate source-specific statuses into a canonical demand state before
  calling Production. A `ready_for_production` demand becomes schedulable only
  after its location is known, positive production weight is supplied, and
  required intake facts such as bag count have been recorded.
- Keep all modules isolated. Application composition roots inject public
  capabilities; modules never import or declare dependencies on one another.
- Treat scheduler output as a proposal.
- Treat `schedule_run` as an immutable proposal.
- Treat `production_run`, `production_batch`, `stage_run`, and versioned production records as operational truth.
- Treat `work_event` as the authoritative mutation ledger and audit trail, not as full event sourcing in v1.
- Prefer consistency over availability for production writes.
- Use workers for projection, retries, reconciliation, and other eventually consistent work. Workers do not own production-floor invariants.
- Keep v1 scoped to wash-and-fold production only.
- Keep orders together in v1: an order can have many bags, but all bags for one order must remain in the same production batch.
- Route exceptions at whole-order granularity. A queued rebatch or in-flight
  defer/rework releases one complete order from its source assignment and
  assigns the complete order to one target batch.
- Do not assign individual bags to machines. Machine usage is modeled at the stage level.
- Allow a production batch to use many washers or dryers inside one stage.
- Allow at most one active production batch per stage kind in v1.
- Use one configurable `pulse_minutes` value for every production stage. A
  batch occupies sorting, washing, drying, and folding/packaging for one full
  planned reservation each. Planned windows are forecasts and coordination
  boundaries, not evidence that physical work happened at those times.
- Treat stage starts and completions as operator-confirmed operational truth,
  not hardware-sensor truth. An otherwise-valid early start or completion
  requires a versioned, actor-bound, timing-bound confirmation that is retained
  in the audit event. The confirmation records floor truth without rewriting
  the accepted plan.

## Plan And Execution Split

The LPMS has two different concepts that must stay separate:

```text
schedule_run = immutable pre-start proposal revision
production_run = the shift's execution aggregate, created only by Start
```

The system may create many `schedule_run` revisions without starting
production. Compute always supersedes the previous current revision. Accept
stores the manager's preferred current revision and warning acknowledgments;
orders remain eligible and no execution rows are created.

Start revalidates the complete eligible-order snapshot and atomically creates
the shift's one `production_run` plus concrete `production_batch`,
`production_batch_order`, `stage_run`, and `stage_machine_assignment` records.
After Start, arrivals enter that stable run through bounded online insertion.

Only an open, unexpired shift without a production run is actionable for
planning. A draft or accepted proposal becomes historical as soon as a
`production_run` references it; closed and expired shifts are also read-only.
The workspace may still load those records by explicit identifier, but it must
not present them as a plan that can be recomputed, accepted, or started.

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

| Operation                      | Model                                | Failure behavior                                                     |
| ------------------------------ | ------------------------------------ | -------------------------------------------------------------------- |
| Ingest a verified webhook      | Durable, availability-oriented inbox | Return a non-success response unless the event is durably stored     |
| Apply canonical order demand   | Idempotent Production transaction    | Retry safely; reject conflicting revisions                           |
| Generate a schedule proposal   | Pure and deterministic               | Retry without changing execution state                               |
| Accept a schedule proposal     | Strongly consistent preference write | Persist the current plan choice; create no execution                 |
| Start an accepted proposal     | Strongly consistent transaction      | Create the shift's one execution graph atomically or fail            |
| Insert a post-start arrival    | Versioned run transaction            | Place without moving existing work, or leave it visibly eligible     |
| Advance or override production | Strongly consistent transaction      | Validate versions and invariants, then commit once or fail           |
| Reconcile missed floor updates | Versioned batch transaction          | Preview and confirm one forward projection, or leave state unchanged |
| Read the production board      | Current-state projection             | Slight read staleness is acceptable; invented state is not           |

Commands that start, advance, assign, override, or reconcile physical
production must not be queued in the browser for later success. If the
database cannot prove the command is valid, the command fails and the operator
retries after reconnecting. The recovery command described below reconciles a
reachable backend with already-advanced floor reality; it is not an offline
command queue.

## External Demand Ingestion

Webhook delivery is an integration concern, not a Production capability. The
generic `webhook-ingestion` module owns durable receipt, deduplication, claims,
leases, retries, dead letters, replay, and external-location bindings. It does
not know how any downstream module interprets an event.

Cents-specific authentication and wire translation live under
`apps/api/src/vendors/cents`. Cents-specific event interpretation lives in a
Worker adapter. Production receives only a canonical order-demand command and
therefore does not know whether demand arrived from Cents, a commercial-order
system, an operator import, or a future adapter.

### Delivery And Dispatch Flow

For v1, `webhook_events` is a Postgres-backed durable inbox and logical queue.
A separate message broker is not required for expected volume.

```text
Cents webhook
-> API verifies the timestamped HMAC against exact raw bytes
-> API parses, classifies, minimizes, and normalizes the Cents wire payload
-> API encrypts the exact raw bytes into the short-lived receipt quarantine
-> webhook-ingestion.ingestEvent(source = cents, status = pending)
-> API links the quarantine receipt to the canonical event
-> commit
-> return a success response

apps/worker
-> webhook-ingestion claims a pending event with a recoverable lease
-> the source/subject dispatcher selects the Cents order consumer
-> the consumer resolves the source-location binding
-> the consumer derives estimated weight and canonical demand state
-> production.applyOrderDemand(..., idempotencyKey = webhook:<event-id>)
-> webhook-ingestion marks the event processed with lease compare-and-set
```

The Production transaction and inbox-completion transaction are intentionally
separate because isolated modules do not share repositories or transactions.
The cross-module guarantee comes from stable idempotency: if the Worker dies
after Production commits but before inbox completion, the lease expires, the
same event is reclaimed, and the same Production command becomes a no-op before
the inbox event is completed.

Authenticated customer and marketing events are recorded as ignored without
putting customer payloads in `webhook_events`. Processable events retain only
the canonical adapter payload required for deterministic downstream
translation. The separate encrypted quarantine preserves the complete raw
receipt temporarily for integration diagnosis, including normalization
rejections, without widening the canonical LPMS contract.

The worker provides at-least-once processing:

- Claim ready events with `FOR UPDATE SKIP LOCKED`.
- Reclaim an event after its worker lease expires.
- Retry transient database, network, and lock failures with bounded
  exponential backoff and jitter.
- Mark permanently invalid events as `dead` and alert for manual review.
- Dispatch through injected consumers; neither `webhook-ingestion` nor
  Production imports the other module.

An independent reconciliation job should periodically read Cents orders updated
since a stored watermark and submit recovered snapshots through the same
generic ingestion command. If Cents does not expose the required read API, the
system cannot promise automatic recovery from an event it never received;
manual replay and operational review become the fallback.

Pressly supports two explicit Cents ingress modes. `hmac` remains the default
and uses this contract:

```text
X-Cents-Timestamp: <unix-seconds>
X-Cents-Signature: v1=<hex HMAC-SHA256>

signed bytes = timestamp + "." + exact raw HTTP body bytes
```

In `hmac` mode, the API accepts timestamps only inside a five-minute
past/future window,
compares fixed-length signature bytes in constant time, and supports a current
and previous key for bounded rotation. A missing, malformed, stale, future, or
body-mismatched signature creates no event. The key is never sent as a raw
header value.

For the initial Cents integration, `CENTS_WEBHOOK_AUTH_MODE=unsigned`
intentionally accepts the vendor's documented HTTPS JSON `POST` without
signature headers. Unsigned mode skips only source authentication; raw-body
capture, content type and size limits, wire validation, deduplication, source
ordering, location binding, and minimized persistence remain unchanged. The
mode is explicit, emits an operational warning, and can be switched back to
`hmac` without changing the route or downstream contracts.

### `webhook_events`

Stores source-neutral inbound events.

```text
webhook_events
- id
- source
- event_type
- dedupe_key
- subject_type
- subject_id
- source_location_id
- source_occurred_at
- payload_json
- payload_hash
- raw_body_sha256
- status
- attempts
- available_at
- lease_owner
- lease_expires_at
- last_error_code
- last_error_message
- received_at
- processed_at
```

Valid statuses are `pending`, `processing`, `processed`, and `dead`.

```text
unique(source, dedupe_key)
index(status, available_at, lease_expires_at)
```

When the wire payload has no reliable event ID, the vendor adapter computes a
stable SHA-256 deduplication key from source, event type, subject identity,
source occurrence time, and the exact raw-body digest. Equal deduplication keys
with different payloads are rejected as divergence rather than overwritten.

### `webhook_receipt_quarantine`

Stores short-lived encrypted diagnostic receipts outside the canonical inbox.
It is owned by generic webhook ingestion; the API vendor boundary owns exact
raw-byte encryption and normalization metadata.

```text
webhook_receipt_quarantine
- id
- source
- raw_body_sha256
- adapter_version
- event_type
- normalization_outcome
- normalization_error_code
- payload_ciphertext
- webhook_event_id
- received_at
- expires_at
- linked_at
```

`payload_ciphertext` is a versioned AES-256-GCM envelope encrypted with a key
dedicated to webhook quarantine. It must not reuse the MFA encryption key.
Accepted receipts link to their canonical `webhook_events` row. Rejected
receipts retain a safe normalization error code but never put customer data in
logs, metrics, Sentry, API errors, or the Processor UI. A worker periodically
purges all rows at or past `expires_at`.

### `source_location_bindings`

Maps a source's location vocabulary into Pressly's location vocabulary without
teaching Production about that source.

```text
source_location_bindings
- source
- external_location_id
- location_id
- is_active
- created_at
- updated_at

primary key(source, external_location_id)
```

Bindings are bootstrapped at an application composition root. Facility
bootstrap may use an empty binding manifest until a vendor location identifier
is confirmed; the empty manifest is a non-destructive no-op. Existing bindings
cannot be silently reassigned, deactivated, or removed by a convergence run.

### Deliberately Excluded Customer Data

LPMS does not need customer identity, contact details, marketing preferences,
attribution, or customer metrics to schedule and execute laundry. Those fields
are discarded when creating the canonical Cents event and never enter a
Production projection. They may exist only inside the encrypted, expiring raw
receipt quarantine for integration diagnosis. A future CRM product may own a
separate, purpose-limited projection; LPMS does not create one incidentally.

## LPMS Production Model

These tables represent source-neutral demand, internal production planning, and
physical execution. Planning records describe what the scheduler proposed.
Execution records describe what operators are actually doing. Section headings
use singular domain vocabulary; fenced field lists use the physical table names
from the current schema.

### `production_location`

Owns one facility's production configuration and live invalidation sequence.

```text
production_locations
- id
- name
- timezone
- is_active
- live_revision
- created_at
- updated_at
```

`live_revision` is monotonic internal synchronization metadata. A committed
`work_event` advances it and causes an SSE invalidation, but it contains no
production payload and never replaces an authoritative workspace or board read.

### `order_demands`

The canonical demand accepted by Production. This is not a webhook or CRM
mirror; it is the smallest source-neutral input required to create and maintain
a production order.

```text
order_demands
- id
- demand_key
- display_reference
- location_id
- revision_hash
- revision_at
- status
- due_at
- created_at
- updated_at
```

`demand_key` is a globally unique adapter-owned identity such as
`cents:order:<external-id>`. `display_reference` is the operator-facing label.
Valid v1 demand states are `ready_for_production` and `not_ready`.

Production applies revisions by source occurrence time, never arrival time. An
older revision is ignored, an equal revision with the same hash is a no-op, and
an equal timestamp with a different hash is rejected for reconciliation. A
location change or mutation after production work is committed is rejected.

### `production_shift`

Represents a production window.

```text
production_shifts
- id
- location_id
- starts_at
- ends_at
- timezone
- status
- effective_folder_count
- version
- created_at
- updated_at
```

`effective_folder_count` means workers assigned to sustained folding work for
that shift, not everyone clocked in. Other labor must still cover sorting,
machine loading, movement, and packaging support for the forecast to hold.

Before Start, shift window and effective folder count changes are versioned
production commands. Any real change supersedes the current schedule revision
and revokes its acceptance; the Processor persists the shift update before it
computes the replacement proposal. A closed shift or a shift that already owns
a production run cannot be edited. Completing the final batch completes the
run and closes its shift in the same transaction.

### `production_order`

Internal LPMS order that can be scheduled for production.

```text
production_orders
- id
- order_demand_id
- location_id
- due_at
- priority
- status
- derived_weight_lbs
- derived_weight_source
- bag_count
- bag_count_source
- intake_recorded_at
- intake_version
- must_stay_together
- version
- eligible_at
- finished_at
- pending_placement
- created_at
- updated_at
```

Recommended constraints:

```text
unique(order_demand_id)
```

For v1:

```text
order_demands.status must be ready_for_production before the production_order
can be scheduled. An active demand with no positive estimated weight is still
stored, but it does not create an executable production_order until a newer
source snapshot supplies a positive estimate.
order_demands.location_id must equal production_order.location_id.
bag_count must be recorded by an authoritative external field or a versioned
operator intake command; absence is not zero.
must_stay_together = true
derived_weight_source = external_estimate when the Cents adapter can derive a
positive estimate from service pricing
```

`intake_version` protects the operator-observed bag fact independently from the
order's general mutation `version`. `pending_placement` durably records a
recoverable `awaiting_run`, `ambiguous_run`, `confirmation_required`, or
`not_placed` outcome and is cleared when Start or a live placement commits.

### `bag`

A logical production unit under an order. This is not an RFID-tracked or
individually machine-assigned object. Bags are created only after an operator
intake command records the observed count; the documented Cents payload does
not establish that fact.

```text
production_bags
- id
- production_order_id
- bag_index
- status
```

Recommended constraints:

```text
unique(production_order_id, bag_index)
```

Important v1 rule:

```text
All bags for one production_order must stay in the same production_batch.
Bags are logical intake units with eligible or finished status in v1; LPMS does
not persist bag-level weight or service type.
```

### `station`

Represents a process step.

```text
production_stations
- id
- location_id
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
production_machines
- id
- location_id
- station_id
- label
- manufacturer_capacity_lbs
- effective_capacity_lbs
- capacity_safety_margin_lbs
- is_active
- created_at
- updated_at
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
scheduler_configs
- id
- location_id
- pulse_minutes
- fold_lbs_per_folder_minute
- algorithm_version
- version
- stage_fit_assertion
- asserted_by
- published_at
```

`pulse_minutes` is configurable and is the single scheduling clock. Every
planned `stage_run` reserves exactly one pulse. Its planned window is a
forecast and resource reservation; actual floor boundaries are separate
operator-observed facts. Starting or finishing physical work early does not
shorten or shift the stored plan. An otherwise-valid early start or completion
uses the explicit confirmation contract described under `stage_run`, while
hard predecessor, stage-kind, machine, and capacity constraints still apply.

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
full pulse for every stage. Routine scheduling only consumes the current
immutable published configuration; it never edits the pulse or fabricates
stage-fit assertions. Those operator-owned facts belong to the rarer
configuration-publication workflow or bootstrap manifest.

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
schedule_runs
- id
- location_id
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
- acknowledged_warning_codes
- created_at
- accepted_at
- accepted_by
- superseded_at
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
makespan, planned completion, and warnings are immutable after creation. A
shift has at most one current draft or accepted revision. Accept records
preference only; Start creates execution.
```

### `production_run`

Represents the sole execution aggregate for one production shift. It is
created directly in `started` by Start and retains schedule provenance.

```text
production_runs
- id
- location_id
- production_shift_id
- schedule_run_id
- status
- started_at
- completed_at
- queue_version
- planned_completion_at
- overtime_proposal_hash
- overtime_queue_version
- overtime_acknowledged_by
- overtime_acknowledged_at
- version
- created_at
- updated_at
```

Recommended constraints:

```text
unique(schedule_run_id)
unique(production_shift_id)
```

Valid statuses:

```text
started
completed
```

`planned` remains readable only as legacy history. New execution never enters
it. `queue_version` tracks composition and membership control independently
from the run lifecycle `version`.

### `production_batch`

Represents a real group of orders moving together through the production floor. A production batch is not a washer load.

```text
production_batches
- id
- location_id
- production_run_id
- sequence_index
- status
- pulse_capacity_lbs
- derived_weight_lbs
- pulse_minutes
- planned_done_at
- started_at
- finished_at
- membership_frozen_at
- membership_frozen_by
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
```

Important:

```text
Orders do not split across production batches.
Orders and bags can split across machines inside a batch stage.
An underfilled production batch still occupies one complete pulse per stage.
A queued batch may be mutable or frozen. Every non-queued batch is permanently
frozen, and starting its first stage freezes it implicitly.
```

### `production_batch_order`

An order-to-batch membership is one durable placement episode. The active
episode stores where the order is now; released episodes remain available for
history.

Placement provenance is:

```text
initial_schedule | automatic | manager_exact | manual_rebatch | exception_route
```

Manager-exact placement and explicit queued rebatching store paired `pinned_at`
and `pinned_by` facts. Automatic online insertion never relocates an existing
membership. A manual route releases the current episode and creates a new one
instead of rewriting placement history.

Join table between production batches and production orders.

```text
production_batch_orders
- id
- location_id
- production_batch_id
- production_order_id
- active
- placement_provenance
- placed_at
- placed_by
- pinned_at
- pinned_by
- released_at
- released_by
- release_reason
```

Recommended constraints:

```text
primary key(id)
unique(production_order_id) where active = true
released_at, released_by, and release_reason are all null or all present
```

Important v1 rule:

```text
A production_order can belong to at most one active production_batch.
```

### `production_order_stage_attempt`

Records one numbered assignment of an order to a canonical batch `stage_run`.
It is order routing history, not another production state machine.

```text
production_order_stage_attempts
- id
- location_id
- production_run_id
- production_order_id
- stage_run_id
- stage_kind
- attempt_number
- status
- assignment_reason
- assigned_at
- assigned_by
- completed_at
- completed_by
- released_at
- released_by
- release_reason
- metadata_json
- created_at
- updated_at
```

Valid statuses:

```text
assigned
completed
released
```

The attempt's order, stage run, stage kind, attempt number, and assignment
reason are immutable identity. Canonical batch-stage completion terminalizes
an assigned attempt as completed. Whole-order routing terminalizes unfinished
source attempts as released and creates new numbered target attempts for the
required stage suffix.

Recommended constraints:

```text
unique(production_order_id, stage_kind, attempt_number)
unique(production_order_id, stage_kind) where status = assigned
completion and release lifecycle fields match status
```

`production_order_stage_attempt` cannot start or complete a `stage_run`, move a
batch, assign a machine, or finish a run. The existing stage advance and floor
reconciliation workflows remain the only batch-stage transition authorities.

### `stage_run`

Represents one real process step for a production batch. This is the state machine owner for the physical workflow.

```text
stage_runs
- id
- location_id
- production_batch_id
- station_id
- stage_kind
- status
- planned_start_at
- planned_end_at
- actual_start_at
- actual_start_provenance
- actual_end_at
- actual_end_provenance
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
```

`blocked` is a server-derived next-action state, not a persisted stage status.
Canceled and exception-stage lifecycles remain deferred.

Important:

```text
queued is a production_batch status before the first stage starts.
stage_run boundaries are operator-confirmed, not washer/dryer hardware-confirmed.
For v1, at most one production_batch can have an active stage_run for the same station kind.
planned_end_at - planned_start_at equals scheduler_config.pulse_minutes for every stage.
An otherwise-valid start before planned_start_at requires an explicit
confirmation bound to actor, stage version, and observed timing. Completing
before the effective completion boundary uses the same class of explicit
confirmation. Neither action rewrites planned_start_at or planned_end_at.
actual_start_provenance and actual_end_provenance are live_observed,
operator_reported, or not_recorded. A null boundary must be not_recorded;
LPMS never fabricates a timestamp for work that happened while it was not being
recorded.
```

### `stage_machine_assignment`

Represents physical machines assigned to a stage. A single stage can use many machines.

```text
stage_machine_assignments
- id
- location_id
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
An idempotency key replays only when its canonical command identity matches the original operation, location, actor, target, expected version, and payload. Reusing a key for any different command is a conflict; it must never return another mutation's result.

```text
work_events
- id
- location_id
- event_type
- entity_type
- entity_id
- actor_id
- expected_version
- idempotency_key
- payload_json
- created_at
```

Current emitted event types:

```text
production_resources_bootstrapped
scheduler_config_published
order_demand_applied
production_shift_created
production_shift_updated
production_order_intake_recorded
production_order_priority_changed
schedule_computed
schedule_accepted
production_run_started
production_order_placement_pending
production_order_placement_overtime_required
production_order_placement_resolved
production_order_rebatched
production_order_route_exception_recorded
batch_membership_frozen
batch_membership_unfrozen
machine_assigned
stage_started
stage_completed
batch_progress_reconciled
```

`idempotency_key` is globally unique. `payload_json` includes the private
canonical command/result identity used for safe replay. Final stage completion
can finish the batch, orders, bags, run, and shift under the single
`stage_completed` event; LPMS does not invent separate completion events for
those projections. Forward floor reconciliation similarly updates the current
stage projection and emits one `batch_progress_reconciled` event rather than a
synthetic sequence of `stage_started` and `stage_completed` events. Because
live revision advancement is work-event-bound, that transaction produces one
SSE invalidation.

### Specific human decisions

There is no generic `manual_overrides` table or generic override endpoint in
v1. Human decisions use narrow versioned commands and their own durable facts:

- exact placement stores `manager_exact` provenance and pin metadata;
- overtime confirmation is bound to the run's proposal hash and queue version;
- freeze and queued-only unfreeze use membership fields and specific events;
- early start is audited in `stage_started.payload.earlyStart`;
- early completion is audited in `stage_completed.payload.earlyCompletion`;
- missed forward progress is recorded through the narrow
  `batch_progress_reconciled` command and event;
- queued order movement is recorded through the versioned
  `production_order_rebatched` command and event;
- in-flight leave-behind or rework is recorded through the versioned
  `production_order_route_exception_recorded` command and event;
- machine assignment and shift update use their dedicated commands and events.

Generic hold, cancellation, damaged-item, and missing-bag override workflows
remain deferred until floor evidence defines their state and audit
requirements. Rewash and other incomplete-stage routes are implemented only as
the bounded whole-order workflow below.

### Order-Level Control and Routing

The Processor root route is an order-first **Home** workspace backed by:

```text
GET /production/locations/:locationId/order-control
```

The server owns filtering and bounded keyset pagination. The contract supports
attention/active/all views, external-reference search, order status, due
window, run, batch, current stage, priority, and movability. It returns current
placement and version facts, next required stage, route-attempt history, and
server-derived action availability. The browser does not load an unbounded
location order set and paginate it locally.

There are two explicit routing workflows:

```text
queued rebatch
  -> source must be queued and unfrozen
  -> employee selects one exact mutable queued target
  -> restart remains sorting

in-flight defer or rework
  -> source batch has started but is not finished
  -> employee records a bounded reason and restart stage
  -> restart cannot skip the current or required work
  -> server selects the earliest feasible strictly later batch
```

Both workflows preview before commit. The proposal binds source and target,
released and assigned stage suffixes, whole-order weight, target capacity, run
queue version, order version, source and target batch versions, and a canonical
hash. Confirmation reloads and locks the current route, recomputes the
proposal, and rejects stale facts.

One accepted route transaction:

```text
release source membership and unfinished order-stage attempts
-> create one target membership and required target attempts
-> transfer the complete order weight between batch aggregates
-> increment source batch, target batch, order, and queue versions
-> clear stale overtime acceptance
-> append one order-routing work_event
-> commit
```

The policy never splits bags, never exceeds hard capacity, and never mutates a
batch's canonical stage state. Completed order-stage attempts stay intact; a
new assignment is a new numbered attempt.

V1 rejects moving the sole active order out of a source batch with
`SOURCE_BATCH_WOULD_BE_EMPTY`. Empty-batch deletion or retention, queue
resequencing, reservation cleanup, in-flight compensation, and completion
effects need an explicit policy and are not guessed by this workflow.

### Production History

The read-only `/history` workspace has Runs, Activity, and Plans views backed
by bounded descending keyset pages. Cursors are bound to their view and filter
set so they cannot be replayed against another history query.

A run detail includes run facts, batches, canonical stage progress, all
historical order-membership episodes, schedule lineage, and a newest-first
sanitized activity window capped at 100 entries with an explicit `hasMore`
marker.

History does not expose raw `work_event.payload_json` or its private
idempotency identity. It maps allowlisted production events into typed summaries
and selected operational details. This is a read projection over durable
operational tables and the audit ledger, not full event sourcing and not a
command surface.

### Floor Truth Recovery After Reconnect

Floor recovery applies when physical work continued while LPMS was unavailable
or operators missed updates, and the backend is reachable again. It is not an
offline-first mode: the Processor does not queue commands, predict success, or
replay browser writes later.

The operator opens **Record floor progress** from the production board, chooses
one batch and a strictly later milestone, records a reason and optional note,
and selects machines only when the target leaves washing or drying active. The
server returns a review preview with the affected stages and terminalization
effects. Confirmation commits only the exact preview hash, run queue version,
batch version, and all four stage versions that were reviewed.

The command is one forward-only atomic projection change:

```text
current stage projection
-> validate canonical four-stage graph and forward target
-> validate predecessor, one-active-stage-kind, machine compatibility,
   machine availability, and hard capacity constraints
-> preview exact effects and confirmation hash
-> confirm against unchanged versions
-> update stage, batch, assignment, membership, order, run, and shift
   projections as required
-> append one batch_progress_reconciled work_event
-> commit and emit one SSE invalidation
```

Planned stage windows remain unchanged. A boundary observed through a normal
live command is `live_observed`. Recovery does not guess when skipped work
started or ended, so those timestamps remain null with `not_recorded`
provenance. `operator_reported` is reserved for a future workflow that captures
an actual operator-supplied time; selecting a milestone alone is not enough to
invent one. Machine assignments that existed only as a skipped stage's mutable
plan are removed instead of being presented as completed actual use; the
immutable schedule and stage window preserve the plan. An assignment already
known to be active is retained when reconciliation completes its stage.
Finishing through recovery uses the same terminalization operation as live
final-stage completion so orders, bags, active memberships, the run, and the
shift cannot diverge.

When reconciliation first moves a queued batch into production,
`production_batch.started_at` is set to the reconciliation commit time. That
field is the lifecycle anchor for when LPMS first recorded the batch as
non-queued; it is not a reconstructed physical start timestamp. Any skipped
stage start remains null with `not_recorded` provenance.

Backward correction, reopening completed work, true offline command queuing or
PWA behavior, and concurrent execution of multiple batches in the same stage
kind remain deferred. Those capabilities require separate state and conflict
models rather than broader behavior in this recovery command.

## Relationships

```text
webhook_events
  -> Worker source adapter
    -> ApplyOrderDemand command
      -> order_demands
        -> production_order
          -> bag[]

source_location_bindings
  -> Worker source adapter

production_shift
  -> schedule_run[]
  -> production_run (zero or one)
    -> schedule_run (provenance)
    -> production_batch
      -> production_batch_order
        -> production_order
          -> production_order_stage_attempt[]
            -> stage_run

production_batch
  -> stage_run
    -> stage_machine_assignment
      -> machine
        -> station
```

## Runtime Boundaries

The API and Worker are application composition roots. They connect isolated
module peers through public ports; modules never call one another. The API
authenticates callers and vendor requests, validates transport input, and
invokes the correct application use case. It does not own production rules.

```text
Laundry Processor
-> API auth, session, validation, and authorization
-> production workflow
   -> production policies
   -> scheduler boundary
   -> repositories
-> Postgres

Cents
-> API Cents authentication and normalization
-> webhook-ingestion durable inbox
-> Worker Cents order consumer
-> Production ApplyOrderDemand use case
-> Postgres

apps/worker reconciliation timer
-> Cents read API, when available
-> webhook-ingestion ingest use case
-> the same Worker Cents order consumer
-> Postgres

Committed work_event
-> production_locations.live_revision
-> transactional Postgres NOTIFY
-> API location change feed
-> authenticated Processor SSE invalidation
-> authoritative workspace or run-board reload
```

Boundary responsibilities:

- `webhook-ingestion` owns generic inbox lifecycle and source-location
  bindings; it owns no downstream interpretation.
- `production workflow` owns canonical demand and transactional production
  commands without vendor or webhook vocabulary.
- `production policies` are pure decisions over explicit inputs.
- `optimization` is pure computation that returns a proposal and performs no
  database writes.
- `apps/api/vendors` owns vendor authentication and wire normalization.
- `apps/worker` owns source consumers, module composition, reconciliation
  adapters, and runtime polling.
- Postgres is the durable authority for ingested events, canonical order
  demand, schedule proposals, and accepted production execution.

The Processor does not poll workspace state. Each committed `work_event`
increments the location's monotonic `live_revision` and emits a transactional
notification. The API's Postgres listener fans out only the revision or a
resync signal over the location-authorized SSE route; it never sends production
payloads. The browser coalesces invalidations, aborts stale loads, reconnects
when visible and online, and reloads authoritative HTTP projections. Immediate
post-command refresh remains part of every mutation path. The SSE heartbeat is
connection liveness, not state polling, and Worker inbox polling remains a
separate durable-job concern.

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
canonical event storage/day <= 1,000 * 25 KB = about 25 MB
canonical event storage/90 days <= about 2.25 GB before indexes and backups
```

The estimate is an upper bound using wire-payload size; raw bodies are not
retained. A single worker processing 20 events/second would drain a six-hour
average backlog of 250 events in about 13 seconds. Throughput does not justify
a separate broker for v1; durability and recovery semantics justify the inbox
and worker.

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

`fixed-pulse-ffd-v2` is the deterministic pre-start scheduler. Its first goal
is to validate the model, invariants, inputs, and operator workflow.

The v2 objective is not to search for a mathematically optimal schedule. It is
to produce the same explainable proposal from the same snapshot and config,
preserve whole orders, respect pulse capacity, and expose when the requested
work does not fit. The pure scheduler boundary permits a different
implementation later only if measured evidence justifies it.

Before Start, the global scheduler receives a stable snapshot containing every
currently eligible order:

```text
eligible_orders
bags
machines
stations
scheduler_config
production_shift
```

Eligible orders are orders whose latest canonical demand is:

```text
order_demands.status = ready_for_production
```

The v2 scheduler should:

```text
bucket every eligible order by due today / tomorrow / later
calculate pulse_capacity_lbs from active resources, folding rate, folders, and pulse_minutes
pack whole orders deterministically into batches no heavier than pulse_capacity_lbs
create one fixed pulse slot per stage for every production batch
sequence batches through queued -> sorting -> washing -> drying -> folding_packaging -> finished
assign washer and dryer machines by effective_capacity_lbs
preserve one-active-batch-per-stage-kind
calculate batch_count, makespan_minutes, planned_completion_at, and shift overflow
return oversized or unplaced orders explicitly
```

Within each due-date bucket, v2 uses stable first-fit decreasing by order
weight with deterministic tie-breakers. This is a packing heuristic, not an
optimization claim. The scheduler never shortens the pulse to make a plan fit.
Every eligible order participates; oversized or otherwise infeasible work is
returned explicitly rather than being hidden by a planning horizon.

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

### Post-Start Online Placement

`online-stable-insertion-v1` operates on the started run's ordered queue and
accepted resource snapshot:

- Priority work uses the earliest feasible mutable queued batch. If none fits,
  it creates a batch after every frozen/in-flight anchor and existing priority
  batch, before the remaining ordinary mutable suffix.
- Ordinary work uses the best-fitting mutable queued batch, breaking ties by
  earliest sequence, or appends a new batch.
- Exact manager placement commits only to the requested mutable batch and
  rejects hard-capacity or stale-version violations without a fallback.
- Existing order membership never moves. A new batch may shift only the
  mutable suffix; frozen and in-flight stage windows remain unchanged.
- The proposal includes a canonical hash, expected queue version, affected
  suffix, projected completion, and overtime outcome.

Queue writes lock the run first, compare `queue_version`, rebuild affected
planned stages and assignments transactionally, then increment the queue once.
Overtime first returns `confirmation_required`; manager confirmation recomputes
and commits only when its proposal hash and queue version still match.

Important:

```text
Scheduler output becomes schedule_run.output_plan.
It becomes production execution data only after Start revalidates the accepted
current revision.
```

## System Interfaces

The authenticated Production HTTP surface is the public contract. Browser
paths are listed separately because UI navigation is not an API command.

| Purpose                    | Method and path                                                                                                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discover locations         | `GET /production/locations`                                                                                                                                                                                                                  |
| Read orders                | `GET /production/locations/:locationId/orders`; `GET /production/locations/:locationId/order-control`                                                                                                                                        |
| Record intake              | `PUT /production/locations/:locationId/orders/:productionOrderId/intake`                                                                                                                                                                     |
| Set priority               | `PATCH /production/locations/:locationId/orders/:productionOrderId/priority`                                                                                                                                                                 |
| Create/update shift        | `POST /production/locations/:locationId/shifts`; `PATCH /production/locations/:locationId/shifts/:productionShiftId`                                                                                                                         |
| Publish scheduler config   | `POST /production/locations/:locationId/scheduler-configs`                                                                                                                                                                                   |
| Compute/read plan          | `POST /production/locations/:locationId/schedules`; `GET /production/locations/:locationId/schedules/:scheduleRunId`                                                                                                                         |
| Accept/Start               | `POST /production/locations/:locationId/schedules/:scheduleRunId/accept`; `POST /production/locations/:locationId/schedules/:scheduleRunId/start`                                                                                            |
| Read workspace             | `GET /production/locations/:locationId/workspace?shiftId=:shiftId`                                                                                                                                                                           |
| Read run board             | `GET /production/locations/:locationId/runs/:productionRunId/board`                                                                                                                                                                          |
| Receive invalidations      | `GET /production/locations/:locationId/events`                                                                                                                                                                                               |
| Automatic/exact placement  | `POST /production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/place`; `POST /production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/orders/:productionOrderId/place`                    |
| Confirm overtime           | `POST /production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/confirm-overtime`                                                                                                                                    |
| Freeze/unfreeze membership | `POST /production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/freeze`; `POST /production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/unfreeze`                                         |
| Assign machines            | `PUT /production/locations/:locationId/stages/:stageRunId/machines`                                                                                                                                                                          |
| Start/complete stage       | `POST /production/locations/:locationId/stages/:stageRunId/start`; `POST /production/locations/:locationId/stages/:stageRunId/complete`                                                                                                      |
| Reconcile floor progress   | `POST /production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/progress-reconciliation`                                                                                                                            |
| Preview/commit order route | `POST /production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/route/preview`; `POST /production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/route`                                       |
| Read production history    | `GET /production/locations/:locationId/history/runs`; `GET /production/locations/:locationId/history/runs/:productionRunId`; `GET /production/locations/:locationId/history/activity`; `GET /production/locations/:locationId/history/plans` |

Compute snapshots all eligible orders and creates a new current revision.
Accept validates the output hash, blocking-warning acknowledgments, and exact
eligible snapshot but creates no execution. Start revalidates the accepted
current revision and returns the created `productionRunId`, batch identifiers,
and initial queue version. Versioned commands carry the expected lifecycle,
batch, or queue version and an idempotency key as required by their contract.
An otherwise-valid early stage start or completion first returns
`confirmation_required` with timing and a confirmation proof; the follow-up
command must return that exact proof. Floor reconciliation also uses a
preview-then-confirm union: the proof binds the actor, target milestone,
reason, machines, queue and batch versions, and all four stage versions.

Workspace selection uses an explicit shift when supplied. Without one it
prefers a unique started run, then a unique actionable accepted plan, then a
unique actionable open shift. Multiple matches are returned as candidates
rather than resolved by a latest-row guess. A schedule is actionable only
while its shift is open and unexpired and no production run references it.

The Processor's real browser routes are `/` for order-first Home, `/schedule`,
`/schedule/:shiftId`, `/production`, `/production/:runId`, `/history`, and
`/configuration`. Query parameters do not own Processor navigation.

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
intake_pending
-> eligible
-> scheduled
-> finished
```

Main `stage_run.status` values:

```text
planned
started
completed
```

The server may return a blocked next action without persisting `blocked` as the
stage status. Per-order route attempts also do not add batch stage states:

```text
assigned -> completed | released
```

That lifecycle describes one order's participation in a canonical
`stage_run`; it cannot advance the batch. Queued whole-order rebatching and
in-flight leave-behind/rewash are explicit commands, not persisted batch
states. The following broader exception workflows remain deferred:

```text
machine_breakdown
missing_bag
damaged_item
canceled_order
manual_hold
```

Important:

```text
Human decisions are specific versioned commands, not a generic override state
or table.
stage_run starts and completions are operator-confirmed.
Every planned stage reserves one full configured pulse.
An otherwise-valid start before planned_start_at or completion before its
effective completion boundary requires explicit confirmation bound to the
actor, stage version, and observed timing; the work_event retains the audit.
Early action does not change stored stage windows. Planned boundaries remain
the accepted forecast rather than a hard claim about physical reality.
A late physical start moves the unconfirmed completion boundary to the later
of planned_end_at and actual_start_at + pulse_minutes.
After reconnect, an operator may reconcile one batch only to a strictly later
milestone through an exact-version preview and confirmation. Skipped timestamps
remain unknown and no synthetic stage events are written.
There is no washer/dryer hardware integration in v1.
```

## Operational Proof

### Implemented V1 Happy-Path Slice

The current repository implements the happy-path slice described above:

- `modules/computation/scheduling` produces deterministic fixed-pulse
  all-eligible proposals and stable online-placement decisions without I/O.
- `modules/policy/production` owns eligibility, schedule acceptance, machine
  assignment, Start, membership, placement, whole-order routing, and
  stage-transition decisions.
- `modules/business/webhook-ingestion` owns source-neutral durable ingestion,
  encrypted-receipt quarantine persistence, retention purge, deduplication,
  leases, retries, dead letters, replay, and source-location bindings.
- `modules/business/production` owns canonical order demand, planning,
  acceptance, Start, online insertion, execution, idempotency, transactions,
  server-paginated order/history projections, whole-order routing,
  controllers, and routes.
  Its source contains no vendor, webhook, receipt, lease, or CRM concepts.
- `apps/api` owns the explicit Cents authentication policy, exact raw-byte
  encryption, and wire normalization, composes the isolated modules, and
  applies authentication, authorization, validation, and HTTP error mapping.
  HMAC remains available; the initial vendor-compatible mode is explicitly
  unsigned.
- `apps/worker` composes webhook ingestion with Production through a declarative
  source/subject consumer registry. The Cents consumer derives the canonical
  demand command; stable event-based idempotency closes the crash window between
  the two module transactions. Until a Cents read API is verified, supported
  recovery is bounded manual replay through the normal ingestion path.
- `apps/processor` is an authenticated, live-only operator surface for location
  discovery, an order-first paginated Home, read-only History, intake,
  configuration, resumable workspace reads, the Compute/Accept/Start lifecycle,
  run-ID boards, pending arrivals, membership controls, queued order moves,
  in-flight leave-behind/rework, exact placement, overtime confirmation,
  machine assignment, and server-authorized floor actions. It refreshes after
  commands and receives revision-only invalidations through authenticated SSE;
  it does not poll the workspace or board on a timer.

Production readiness requires an explicit ingress mode. The current API
adapter supports timestamped HMAC and Cents-compatible unsigned HTTPS JSON;
production must configure the selected mode and a dedicated quarantine
encryption key. Automatic read/reconciliation remains disabled until Cents
proves an authoritative updated-since API. Queued rebatching and bounded
in-flight leave-behind/rewash are implemented as whole-order routes. Manual
holds, hard-confirmed cancellation, damaged-item, missing-bag, backward
correction, and sole-order empty-batch workflows remain intentionally deferred.

The implementation is correct enough for v1 only when these failure cases are tested:

```text
Deliver the same webhook repeatedly -> one durable event and one effective
Production demand application.
Deliver order snapshots out of order -> newest source revision wins.
Stop a worker after it claims an event -> the expired lease makes the event claimable again.
Stop a worker after Production commits but before inbox completion -> redelivery
uses the same idempotency key, becomes a Production no-op, and completes the
inbox event.
Deliver a permanently invalid payload -> the event becomes dead and raises an alert.
Deliver a valid order before weighing -> retain advisory demand without an
executable production_order; a later positive estimate promotes it normally.
Reject a valid-JSON vendor body during normalization -> retain only its
encrypted short-lived quarantine receipt and safe rejection telemetry.
Omit a webhook -> reconciliation restores the missing vendor state only when a
verified Cents updated-since API exists; otherwise alert and use bounded manual replay.
Race two production commands -> optimistic concurrency and constraints allow only one valid write.
Make Postgres unavailable -> production commands fail without partial state.
Schedule the same snapshot with the same config twice -> byte-equivalent plans.
Finish washer work early -> the first command returns a timing-bound confirmation;
confirming records the physical completion and audit without rewriting either
stage's planned window. Starting the dryer before its planned boundary returns
its own timing-bound confirmation, while predecessor and machine constraints
remain hard.
Continue floor work during an LPMS interruption -> after reconnect, preview and
confirm one strictly forward batch milestone; skipped timestamps remain unknown,
one reconciliation event is written, and terminalization matches the live path.
Move an order between queued batches -> require a mutable queued source and the
exact selected mutable queued target; preview then atomically transfer the whole
order without changing either batch's stage state.
Leave an order behind in an in-flight batch -> choose the earliest feasible
strictly later batch, release unfinished source attempts, preserve completed
attempts, and assign the required target stage suffix under one versioned
transaction.
Try to move the only active order in a batch -> reject with
SOURCE_BATCH_WOULD_BE_EMPTY until empty-batch compensation is explicitly
modeled.
Page Home or History across a large location -> use server keyset cursors and
filters; do not load the complete order or audit set into browser memory.
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
plan supersessions and production runs started
live placement outcomes and queue-version conflicts
explicit or stage-start batch freezes
version-bound overtime confirmations
```

## Core Invariants

```text
A production_order is schedulable only when its latest order_demand is
ready_for_production, its location matches, its derived weight is positive, and
bag intake is complete.
A production_order can belong to at most one active production_batch.
All bags for one production_order must stay in the same production_batch.
A queued rebatch or in-flight route moves the complete order atomically.
A queued move requires an unfrozen queued source and exact mutable queued
target; an in-flight route targets the earliest feasible strictly later batch.
Every target stage assigned by an order route must have hard capacity for the
complete order.
A production_order_stage_attempt retains immutable assignment identity and
closes only as completed or released; a later route creates a new numbered
attempt.
production_order_stage_attempt is order routing history, not a second batch
state machine.
Only canonical stage advance or floor reconciliation changes batch/stage
progression; order routing cannot start, complete, rewind, or finish a stage.
V1 does not route the sole active order out of a source batch because
empty-batch compensation is not yet modeled.
A production batch stage may use multiple machines, but v1 does not persist a
bag-to-machine assignment.
A bag is not assigned to a machine.
A production batch stage can be assigned to many machines.
A production batch is not a washer load.
A production batch can be active in only one stage at a time.
At most one production batch can be active per stage kind in v1.
A stage cannot start before the previous stage completes.
A planned stage reserves exactly one scheduler_config.pulse_minutes slot.
Planned stage windows are forecasts and resource reservations, while actual
boundaries are separately observed floor facts.
An otherwise-valid early stage start requires explicit,
actor/version/timing-bound confirmation and an audit event.
An early stage completion requires explicit, actor/version/timing-bound
confirmation and an audit event.
Early physical action does not mutate the accepted planned window.
A machine cannot have overlapping active stage_machine_assignments.
Washer and dryer scheduling use effective_capacity_lbs, not manufacturer_capacity_lbs.
pulse_capacity_lbs is the minimum of effective washer, dryer, and folding capacity per pulse.
folding capacity is fold_lbs_per_folder_minute * effective_folder_count * pulse_minutes.
The same scheduler_config version and input snapshot produce the same schedule proposal.
The weight-based minimum batch count does not override whole-order packing.
An order heavier than pulse_capacity_lbs is unplaced in v1; it is never silently split.
The v1 Cents Worker adapter derives estimated weight from service pricing when
the snapshot contains a positive calculable value. Missing pre-weigh pricing
is represented as no estimate, not as zero or a dead webhook; Production keeps
the advisory demand out of executable work until a later positive estimate.
Finished means folding and packaging are complete.
Stage completion is operator-confirmed, not hardware-confirmed.
schedule_run input and output snapshots are immutable after creation.
Compute supersedes the prior current schedule revision, even when its plan hash
is unchanged.
Accepting a schedule_run creates no execution and leaves its orders eligible.
Start creates at most one production_run for a shift, directly in started.
Start fails when the complete eligible-order snapshot differs from the accepted
revision.
Only an open, unexpired shift without a production_run is actionable for
planning; run-owned, closed, and expired shifts are history.
Changing a pre-start shift window or effective_folder_count is versioned and
supersedes its current schedule revision before replacement Compute.
production_run execution records are mutable only through versioned commands.
Automatic placement never moves an existing order membership.
Hard pulse capacity applies to automatic, exact, and overtime-confirmed
placement.
Every queue mutation compares and increments queue_version exactly once.
Every non-queued batch has frozen membership; queued unfreeze is manager-only.
Overtime acceptance is bound to an exact placement hash and queue version.
Exact placement, overtime confirmation, membership control, machine
assignment, shift updates, early starts, early completion, and floor
reconciliation use their specific expected version or proposal identity.
Floor progress reconciliation is atomic and strictly forward-only, preserves
all hard stage, machine, and capacity constraints, and emits one
batch_progress_reconciled work_event rather than synthetic stage events.
Missed stage boundaries remain null with not_recorded provenance; recovery does
not invent event times.
Finishing through floor reconciliation uses the same order, bag, membership,
run, and shift terminalization as live final-stage completion.
Webhook ingress is acknowledged only after durable commit.
Webhook processing is at least once and Production demand application is
idempotent.
Order-demand revision ordering uses source occurrence time, not inbox arrival
time or an invented numeric source version.
Dead webhook events remain available for inspection and replay.
Workers cannot bypass production command invariants.
Modules never import or declare dependencies on other modules; apps compose
their public ports.
The scheduler cannot mutate execution state directly.
work_event is the authoritative mutation ledger and audit trail.
Operational tables are the current-state projections for reads.
Each committed work_event advances one location live_revision; SSE carries
only invalidations, and HTTP projections remain the source of read truth.
Home and History use bounded server keyset pagination and server-side filters.
Public History exposes typed sanitized activity summaries, never raw
work_event payloads or private idempotency data.
```
