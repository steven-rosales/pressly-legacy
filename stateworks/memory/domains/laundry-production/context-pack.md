# Laundry Production Context Pack

## Domain

Laundry Production (`laundry-production`)

## Summary

Durable business memory for Pressly's wash-and-fold production process. LPMS is the product/system being built; laundry-production is the business domain.

## Invariants

- orders_do_not_split_across_batches: A production_order can belong to at most one active production_batch, and all bags for one order must stay in that same production_batch.
- bags_not_assigned_to_machines: Individual bags are not assigned to machines in v1; machine use is modeled at the stage level.
- batch_is_not_machine_load: A production_batch is a group of orders moving together through production, not a washer load or dryer load.
- batch_single_active_stage: A production_batch can be active in only one stage at a time.
- one_active_batch_per_stage_kind_v1: For v1, at most one production_batch can have an active stage_run for the same stage kind.
- stage_order_is_sequential: A stage cannot start before the previous required stage for the same production_batch is completed.
- machines_do_not_overlap: A machine cannot have overlapping active stage_machine_assignments.
- schedule_run_is_immutable: A schedule_run input snapshot, output plan, hashes, algorithm version, score, and warnings are immutable after creation.
- one_production_run_per_schedule: Accepting a schedule_run creates exactly one production_run.
- scheduler_does_not_mutate_execution: The scheduler returns proposals and cannot mutate execution state directly.
- stage_completion_is_operator_confirmed: stage_run completion is operator-confirmed operational truth, not washer or dryer hardware-confirmed truth.
- webhooks_are_idempotent: Inbound CRM webhook events must be idempotent.
- every_stage_occupies_one_pulse: Sorting, washing, drying, and folding_packaging each occupy exactly one scheduler_config.pulse_minutes slot for every production_batch.
- batches_advance_only_on_pulse_boundaries: A production_batch advances only at pulse boundaries; early physical completion does not shorten a stage or move downstream start times.
- pulse_capacity_is_the_stage_bottleneck: pulse_capacity_lbs equals the minimum of total active washer effective capacity, total active dryer effective capacity, and fold_lbs_per_folder_minute multiplied by effective_folder_count and pulse_minutes.
- empty_pipeline_makespan: For the four-stage empty pipeline, makespan_minutes equals (actual_batch_count + 4 - 1) multiplied by pulse_minutes.
- oversized_orders_are_unplaced_v1: A production_order heavier than pulse_capacity_lbs is returned as unplaced in v1 and is never silently split.
- schedule_proposals_are_deterministic: The same eligible-order snapshot, resource snapshot, scheduler_config version, and operator directives produce the same schedule proposal.
- production_run_starts_before_stages: A stage_run cannot start until its owning production_run is started.
- cents_projection_source_version_serialized: Concurrent Cents projections for one external order are serialized, and only a strictly newer vendor source version may replace the current projection.

## Policies

- cents_in_progress_is_eligible: A Cents order is eligible for LPMS production only when the latest projected CRM order status is IN_PROGRESS.
- cents_weight_derivation_v1: For v1, LPMS derives production weight from Cents laundry service pricing instead of measured bag-level weight.
- wash_fold_only_v1: V1 is scoped to wash-and-fold production only.
- heijunka_pulse_v1: V1 uses deterministic heijunka-style leveling with configurable pulse_minutes; initial planning uses 56 minutes rather than deriving a stage duration.
- washer_effective_capacity: Washer scheduling uses effective capacity below manufacturer capacity to preserve cleaning quality.
- no_hardware_integration_v1: V1 has no washer or dryer hardware integration; operators confirm starts and completions manually.
- due_bucket_selection_v1: V1 scheduling should expose due-today, due-tomorrow, and later order buckets for operator judgment.
- consistency_over_availability: Production writes prefer consistency over availability.
- greedy_scheduler_before_optimization_v1: V1 uses a deterministic and explainable greedy packing heuristic rather than claiming combinatorial optimality; deeper optimization requires operational evidence.
- priority_means_earliest_feasible_batch: A priority production_order is placed in its earliest feasible batch ahead of non-priority peers, subject to eligibility, pulse capacity, and whole-order constraints; priority does not guarantee batch one.
- future_order_pull_forward_requires_horizon: Future-due production_orders may fill unused capacity only within an explicit operator-selected planning horizon, and pulling them forward does not change their due dates.

## Decisions

- domain_named_laundry_production: The durable Stateworks memory domain is named laundry-production instead of lpms because LPMS is the app/system name.
- schedule_run_is_proposal: schedule_run represents a scheduler proposal, not real production-floor execution.
- production_run_is_execution_truth: production_run and its production_batch and stage_run records represent accepted execution truth.
- stage_run_owns_floor_state: stage_run owns the physical workflow state machine.
- work_event_not_full_event_sourcing_v1: work_event is the authoritative mutation ledger and audit trail, but LPMS is not full event sourcing in v1.
- typescript_scheduler_first: Build the first scheduler in TypeScript behind a boundary that can later be replaced by a Rust solver.
- memory_keeps_rules_docs_keep_schema: Stateworks memory stores durable business rules; docs/plan/lpms.md stores richer schema and modeling detail.
- happy_path_delivery_before_exceptions: Deliver the happy path through the API and scheduler, processor integration, and UI before implementing manual holds, hard-confirmed cancellation, recovery, and exception UX from observed workflows.
- fixed_pulse_scheduler_ordering_v1: V1 orders scheduling candidates by priority, due-date bucket, weight descending, due timestamp, and stable production_order ID before whole-order first-fit-decreasing packing.
- durable_inbox_worker_v1: V1 processes Cents demand from a Postgres inbox with SKIP LOCKED claims, expiring leases, bounded retry backoff, inspectable dead letters, and an explicit reconciliation port.
- processor_uses_backend_action_availability: The LPMS processor renders stage actions returned by the production API and does not recreate stage-transition policy in the browser.
- isolated_lpms_module_composition: Production business, production policy, and fixed-pulse scheduling are isolated peer modules composed through narrow ports only in API and worker apps.

## Workflows

- production_batch_happy_path: queued -> sorting -> washing -> drying -> folding_packaging -> finished
- scheduling_to_execution: API durably receives a verified Cents event -> worker projects the newest vendor source version -> eligible production_orders form an immutable scheduling snapshot -> deterministic scheduler creates a schedule_run proposal -> operator acknowledges blocking warnings and accepts the output hash -> LPMS creates one production_run and its batches, stages, assignments, and work_event atomically -> operator starts the production_run -> operators advance server-authorized stage_run actions at pulse boundaries -> production_batch finishes folding and packaging
- production_command_write_path: receive command -> validate invariants -> insert work_event -> update operational tables -> commit transaction
- fixed_pulse_pipeline: sorting for one pulse -> washing for one pulse -> drying for one pulse -> folding_packaging for one pulse

## Vocabulary

- actor:operator: A person using LPMS to execute or confirm production-floor work.
- actor:manager: A person who can create, review, accept, and supervise production schedules and runs.
- actor:employee: A production worker who performs sorting, washing, drying, folding, or packaging work.
- external_system:cents: The v1 CRM/vendor system and external order authority for webhook-driven order demand.
- object:crm_order: The normalized projection of a Cents order; it is external demand, not production truth.
- object:production_order: The internal LPMS view of a CRM order that may become eligible for production scheduling.
- object:schedule_run: An immutable scheduler proposal containing input snapshot, output plan, hashes, score, and warnings.
- object:production_run: The accepted execution instance created from a schedule proposal.
- object:production_batch: A real group of production orders moving together through the floor; it is not a washer load.
- object:stage_run: The state-machine owner for one physical process step of one production batch.
- object:stage_machine_assignment: A stage-level assignment of one physical machine to a stage run.
- object:machine: A physical constrained production resource such as a washer, dryer, or folding station.
- object:scheduler_config: Versioned configuration for pulse duration, folding rate, algorithm version, and scheduler behavior.
- object:work_event: The authoritative mutation ledger and audit trail for production changes.
- states:schedule_run: draft, accepted, superseded, rejected
- states:production_run: planned, started, completed, canceled
- states:production_batch: queued, sorting, washing, drying, folding_packaging, finished, canceled, blocked
- states:stage_run: planned, started, completed, blocked, canceled

## Assumptions

- cents_price_weight_good_enough_v1: Cents price-derived weight is good enough for first-version scheduling.
- initial_fold_rate: Initial planning uses 2 pounds per effective folder minute, but the value remains configurable and must later be calibrated from observed production data.
- commercial_orders_low_volume_v1: Commercial orders are low enough volume in v1 to stay inside the same simple batching model.
- manual_stage_confirmation_is_acceptable_v1: Manual operator confirmation is acceptable as the source of stage completion truth in v1.

## Open Questions

- exception_effects: How should manual holds, hard-confirmed cancellations, rewash, damaged items, and missing bags affect an accepted production_run?
- role_permission_mapping: Which actions belong to owner, manager, employee, and admin roles?
- production_shift_boundaries: How should production shifts constrain schedule generation, continuation, and completion?
- replan_after_drift: When execution drifts from a schedule, should LPMS preserve the old plan, replan remaining batches, or create a new schedule_run?
