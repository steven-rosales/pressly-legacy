# Laundry Production Context Pack

## Domain

Laundry Production (`laundry-production`)

## Summary

Durable business memory for Pressly's wash-and-fold production process. LPMS is the product/system being built; laundry-production is the business domain.

## Invariants

- orders_do_not_split_across_batches: A production_order can belong to at most one active production_batch, every queued rebatch or in-flight route moves the complete order atomically, and all bags remain with that order.
- bags_not_assigned_to_machines: Individual bags are not assigned to machines in v1; machine use is modeled at the stage level.
- batch_is_not_machine_load: A production_batch is a group of orders moving together through production, not a washer load or dryer load.
- batch_single_active_stage: A production_batch can be active in only one stage at a time.
- one_active_batch_per_stage_kind_v1: For v1, at most one production_batch can have an active stage_run for the same stage kind.
- stage_order_is_sequential: A stage cannot start before the previous required stage for the same production_batch is completed.
- machines_do_not_overlap: A machine cannot have overlapping active stage_machine_assignments.
- schedule_run_is_immutable: A schedule_run input snapshot, output plan, hashes, algorithm version, score, and warnings are immutable after creation.
- scheduler_does_not_mutate_execution: The scheduler returns proposals and cannot mutate execution state directly.
- stage_completion_is_operator_confirmed: stage_run completion is operator-confirmed operational truth, not washer or dryer hardware-confirmed truth.
- webhooks_are_idempotent: Inbound CRM webhook events must be idempotent.
- every_stage_occupies_one_pulse: The scheduler reserves exactly one scheduler_config.pulse_minutes planned window for sorting, washing, drying, and folding_packaging for every production_batch; the window is a forecast and resource reservation, while confirmed actual floor timing may differ without rewriting the accepted plan.
- pulse_capacity_is_the_stage_bottleneck: pulse_capacity_lbs equals the minimum of total active washer effective capacity, total active dryer effective capacity, and fold_lbs_per_folder_minute multiplied by effective_folder_count and pulse_minutes.
- empty_pipeline_makespan: For the four-stage empty pipeline, makespan_minutes equals (actual_batch_count + 4 - 1) multiplied by pulse_minutes.
- oversized_orders_are_unplaced_v1: A production_order heavier than pulse_capacity_lbs is returned as unplaced in v1 and is never silently split.
- schedule_proposals_are_deterministic: The same eligible-order snapshot, resource snapshot, scheduler_config version, and operator directives produce the same schedule proposal.
- production_run_starts_before_stages: A stage_run cannot start until its owning production_run is started.
- cents_projection_source_version_serialized: Concurrent Cents projections for one external order are serialized, and only a strictly newer vendor source version may replace the current projection.
- one_production_run_per_shift: Exactly one production_run may exist for one production shift, and Start is the only lifecycle transition that creates it.
- new_production_run_begins_started: A newly created production_run begins directly in started execution; planned is retained only as a legacy-readable state for pre-migration history.
- accept_does_not_create_execution: Accept records preference for the current immutable schedule_run revision and acknowledged warnings; it creates no production_run, batch, stage, assignment, or scheduled-order transition.
- one_current_schedule_revision_per_shift: A production shift has at most one current draft or accepted schedule_run revision; every successful Compute supersedes the previous current revision and revokes its acceptance.
- start_requires_current_accepted_snapshot: Start succeeds only when the accepted schedule_run is still the current revision and its complete eligible-order snapshot is unchanged.
- post_start_orders_enter_existing_run: An order that becomes eligible after Start may enter only the existing production_run for its shift; LPMS never creates a sibling run for the arrival.
- batch_membership_freeze_is_orthogonal: Batch execution status and membership mutability are separate; queued membership may be mutable or explicitly frozen, while every non-queued batch is permanently frozen.
- online_insertion_has_zero_automatic_recourse_v1: V1 automatic live placement may place only the arriving order and may not relocate any existing production_order between batches.
- pulse_capacity_is_hard: Neither automatic placement, manager-exact placement, nor overtime acceptance may make a production_batch exceed pulse_capacity_lbs.
- queue_composition_is_versioned: Every committed queue-composition or membership mutation compares the expected production_run queue version and increments it exactly once.
- overtime_acceptance_is_version_bound: Overtime acceptance applies only to the exact placement proposal hash and queue version that the manager reviewed; any later queue change invalidates it.
- eligible_snapshot_mutations_are_serialized_v1: Compute, Accept, Start, and demand, intake, or priority commands that can change the eligible-order snapshot serialize per location before validating or mutating that snapshot.
- pending_live_placement_is_durable_v1: When live placement cannot commit because confirmation or a recoverable condition is required, the production_order remains eligible and its pending placement outcome is durable and reloadable from the backend.
- inactive_batch_membership_history_is_retained_v1: Completing production deactivates current batch membership without deleting its historical production_batch_order record.
- shift_planning_commands_respect_operating_window_v1: Compute and Accept are allowed only before the production shift ends, while Start is allowed only at or after shift start and before shift end.
- prestart_shift_changes_revoke_current_plan_v1: Before a production run exists, a versioned material change to shift start, end, or effective folder count atomically supersedes the current schedule and revokes acceptance; after a run exists the shift is not mutable.
- early_stage_completion_is_confirmation_bound_v1: Completing a started stage before the later of its planned end and actual start plus one pulse requires an actor-bound, stage-version-bound, timing-bound confirmation that is revalidated and audited with the transition.
- final_batch_completion_closes_run_and_shift_v1: Completing the final folding_packaging stage terminalizes its assignments, orders, bags, active memberships, and batch and, when every run batch is finished, completes the production_run and closes its production shift in the same transaction.
- production_live_revision_is_work_event_bound_v1: Every committed location-owned production work_event advances that location's durable live revision exactly once in the same transaction; notification is an invalidation hint rather than production truth.
- planned_stage_windows_are_advisory_reservations_v1: Planned stage windows coordinate expected flow and reserve resources, but an otherwise-valid operator-confirmed early start or completion may record actual floor truth without mutating those planned boundaries.
- early_stage_start_is_confirmation_bound_v1: Starting a stage before planned_start_at succeeds only when every other transition invariant holds and an actor-bound, stage-version-bound, timing-bound confirmation is revalidated and audited with the transition.
- stage_boundary_provenance_is_explicit_v1: Every actual stage boundary is classified as live_observed, operator_reported, or not_recorded; a missed boundary remains null and not_recorded rather than receiving an inferred timestamp.
- reconciled_batch_start_is_a_recorded_lifecycle_anchor_v1: When floor reconciliation first moves a queued production_batch forward, started_at records the reconciliation commit time when LPMS learned that execution had begun; it is not a reconstructed physical stage-start timestamp, and any skipped stage boundary remains not_recorded.
- floor_progress_reconciliation_is_forward_only_v1: Floor progress reconciliation may move one coherent started-run batch only to a strictly later canonical milestone; backward correction and reopening are separate deferred workflows.
- floor_progress_reconciliation_preserves_unknown_boundaries_v1: Reconciliation records the current milestone without inventing timestamps, stage events, or historical machine assignments for work that LPMS did not observe; a skipped stage's planned assignment is removed from the mutable execution projection while its immutable schedule and stage window retain the plan.
- floor_progress_reconciliation_is_atomic_v1: A confirmed floor reconciliation compares the expected run queue version, batch version, and all four stage versions, updates the complete current projection atomically, increments queue composition at most once when required, and appends exactly one batch_progress_reconciled work_event.
- floor_progress_reconciliation_terminalization_parity_v1: Reconciliation to finished uses the same terminalization operation as live final-stage completion for assignments, orders, bags, active memberships, batch, run, and shift.
- whole_order_routing_is_atomic_v1: A committed order route atomically releases the source membership and unfinished attempts, creates one target membership and required target attempts, updates source and target aggregate weights, compares and increments the relevant queue, batch, and order versions, invalidates stale overtime acceptance, and appends exactly one routing work_event.
- batch_stage_transition_has_one_authority_v1: Canonical production_batch and stage_run progression changes only through the existing stage advance or floor-reconciliation authorities; order routing and production_order_stage_attempt records cannot independently start, complete, rewind, or finish a batch stage.
- order_stage_attempt_assignment_is_immutable_v1: A production_order_stage_attempt retains its order, canonical stage_run, stage kind, attempt number, and assignment reason; completion or release terminalizes that assignment, and later routing creates a new numbered attempt instead of rewriting prior route history.
- in_flight_order_route_moves_later_v1: An in-flight defer or rework route may target only a strictly later production_batch, may not skip the current or requested restart work, and must fit the complete order within hard capacity for every newly assigned target stage.

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
- prestart_planning_includes_all_eligible_orders: Before Start, Compute includes every currently eligible production_order for the shift rather than an operator-selected planning horizon.
- priority_live_placement_v1: A priority arrival uses the earliest feasible mutable queued batch; if none fits, LPMS creates a batch after frozen or in-flight anchors and existing priority work but before the remaining ordinary mutable suffix.
- ordinary_live_placement_v1: An ordinary arrival uses the best-fitting mutable queued batch with earliest sequence as the tie-breaker; if none fits, LPMS appends a new batch.
- manager_exact_batch_placement_v1: An authorized manager may pin an arriving order to an exact requested mutable queued batch when the placement satisfies hard physical constraints; LPMS must not silently substitute another batch.
- overtime_requires_explicit_acceptance: A placement projected beyond the shift end is shown as an overflowing plan and commits only after an authorized manager explicitly accepts that exact overtime outcome.
- human_stability_is_a_scheduling_objective: Scheduling decisions balance priority and tardiness, overtime, pulse utilization, and the recourse or churn imposed on floor workers; packing efficiency alone is insufficient.
- schedule_actionability_is_run_provenance_aware_v1: A draft or accepted schedule is actionable only while its shift is open and unexpired and no production_run uses that schedule as provenance; run-owned, closed, and expired contexts are read-only history.
- floor_progress_reconciliation_preserves_hard_constraints_v1: Floor reconciliation cannot override stage sequence, one active batch per stage kind, machine compatibility, active-machine availability, machine non-overlap, whole-batch membership, or hard effective capacity constraints.
- queued_order_rebatch_v1: A queued whole-order move is allowed only from an unfrozen queued source to the exact employee-selected mutable queued target; LPMS rejects the move rather than substituting another batch.
- in_flight_order_defer_or_rework_v1: A started but unfinished whole order may be left behind or assigned bounded rework by releasing its unfinished source-stage attempts and assigning the required stage suffix in a later batch while preserving completed attempts as history.
- earliest_feasible_later_order_route_v1: For an in-flight defer or rework command, LPMS chooses the earliest stable later batch whose required stage suffix remains planned and whose per-stage assigned load can accept the complete order without exceeding hard capacity.

## Decisions

- domain_named_laundry_production: The durable Stateworks memory domain is named laundry-production instead of lpms because LPMS is the app/system name.
- schedule_run_is_proposal: schedule_run represents a scheduler proposal, not real production-floor execution.
- production_run_is_execution_truth: production_run is the sole live execution aggregate for a shift and is created at Start, while schedule_run revisions remain pre-start proposals and audit history.
- stage_run_owns_floor_state: stage_run rows own the current physical workflow projection and remain the sole batch-stage transition authority; production_order_stage_attempt rows record per-order participation and routing history against those canonical stages but cannot advance execution.
- work_event_not_full_event_sourcing_v1: work_event is the authoritative mutation ledger and audit trail, but LPMS is not full event sourcing in v1.
- typescript_scheduler_first: Build the first scheduler in TypeScript behind a boundary that can later be replaced by a Rust solver.
- memory_keeps_rules_docs_keep_schema: Stateworks memory stores durable business rules; docs/plan/lpms.md stores richer schema and modeling detail.
- happy_path_delivery_before_exceptions: The happy path was delivered before exceptions; the first bounded exception slice now supports queued whole-order rebatching and in-flight defer or rework, while generic holds, cancellations, damage, missing items, and backward correction remain separate workflows.
- fixed_pulse_scheduler_ordering_v1: V1 orders scheduling candidates by priority, due-date bucket, weight descending, due timestamp, and stable production_order ID before whole-order first-fit-decreasing packing.
- durable_inbox_worker_v1: V1 processes Cents demand from a Postgres inbox with SKIP LOCKED claims, expiring leases, bounded retry backoff, inspectable dead letters, and an explicit reconciliation port.
- processor_uses_backend_action_availability: The LPMS processor renders stage actions returned by the production API and does not recreate stage-transition policy in the browser.
- isolated_lpms_module_composition: Production business, production policy, and fixed-pulse scheduling are isolated peer modules composed through narrow ports only in API and worker apps.
- online_scheduling_uses_bounded_recourse: LPMS treats post-start arrivals as an online scheduling problem with frozen work as irrevocable, zero automatic recourse in v1, and explicit human overrides as durable constraints.
- offline_optimum_is_a_benchmark: Offline optimal schedules and competitive analysis are evaluation tools for LPMS algorithms, not authority to silently rewrite the live physical queue.
- backend_owns_workspace_identity: Shift, current-plan, production-run, queue-version, action availability, and historical status come from backend state and explicit resource identifiers rather than temporary Processor state, query-owned navigation, automatic invalid-path redirects, or arbitrary overlapping-shift selection.
- defer_probabilistic_stability_score_v1: V1 does not use an arbitrary or probabilistic 0-to-1 stability value; any later stability term must be an evidence-backed scoring penalty rather than randomness.
- defer_silent_live_reoptimization_v1: V1 does not silently repack the live queued suffix; a future optimizer may only preview bounded moves and requires explicit manager acceptance before mutation.
- run_centered_algorithms_implemented_v1: The implemented pre-start planner is fixed-pulse-ffd-v2 and the implemented post-start pure placement computation is online-stable-insertion-v1.
- run_centered_forward_migration_v1: Migration 0016 aborts before mutation on duplicate shift runs or inconsistent execution, normalizes legacy planned runs back to accepted plans, enforces one current plan and one run per shift, and adds queue, freeze, placement-provenance, and v2 scheduler facts.
- processor_uses_sse_invalidation_v1: The Processor uses an authenticated per-location SSE revision stream to invalidate and coalesce authoritative workspace or board reads; streamed payloads never become a second source of production state and timer polling is not used for production synchronization.
- worker_inbox_polling_remains_intentional_v1: The private Worker continues bounded durable-inbox claim polling with idle waits, retry backoff, lease fencing, heartbeat, and separately throttled backlog sampling; this job-execution loop is independent of Processor live synchronization.
- floor_recovery_is_not_offline_first_v1: V1 floor recovery operates only after the backend is reachable and reconciles already-advanced physical reality; the Processor does not queue offline production commands, predict success while disconnected, or replay browser writes later.
- defer_backward_floor_correction_and_reopen_v1: Backward stage correction and reopening completed stages, batches, runs, or shifts require a separate exception and compensation model and are deferred.
- defer_offline_command_queue_and_pwa_v1: A true offline command log, PWA execution mode, replay protocol, and conflict-resolution experience are deferred rather than approximated by forward reconciliation.
- defer_concurrent_same_kind_execution_v1: V1 retains at most one active production_batch per stage kind; redesigning capacity and operator coordination for concurrent same-kind execution is deferred.
- server_paginated_order_home_and_history_v1: The Processor root is an order-first Home surface and /history is a read-only production audit surface; both use bounded server keyset pagination and server-side filters rather than loading an unbounded location history into browser state.
- sanitized_history_projection_v1: Public production history exposes typed event summaries and selected operational detail only; raw work_event payloads and private idempotency records remain internal, and run detail activity is capped with an explicit continuation signal.
- defer_sole_order_empty_batch_routing_v1: V1 rejects routing the only active order out of a source batch because empty-batch retention or deletion, queue resequencing, planned reservation cleanup, in-flight compensation, and completion effects require an explicit separate policy.

## Workflows

- production_batch_happy_path: queued -> sorting -> washing -> drying -> folding_packaging -> finished
- scheduling_to_execution: API durably receives and projects canonical external order demand -> eligible production_orders form the complete immutable scheduling snapshot for one shift -> Compute creates a new immutable schedule_run revision and supersedes the prior current revision -> manager reviews warnings and accepts the current output hash without creating execution -> Start revalidates the current accepted revision, exact eligible-order snapshot, and active shift window -> LPMS creates the shift's sole started production_run and its initial batches, stages, assignments, order transitions, and work_event atomically -> operators advance server-authorized stage_run actions; an otherwise-valid early start or completion requires an exact current confirmation and never rewrites planned stage windows -> after reconnect, an operator may reconcile one batch to a strictly later physical milestone through a previewed and exact-version confirmation without synthetic stage events -> post-start arrivals are placed into the existing production_run without moving existing orders automatically -> employees may explicitly rebatch a whole queued order or defer and rework a whole in-flight order into a later batch without changing canonical batch-stage progression -> final folding and packaging completion, whether live or reconciled, terminalizes the remaining floor facts, completes the run, and closes the shift atomically
- production_command_write_path: receive command -> validate invariants -> insert work_event -> update operational tables -> commit transaction
- fixed_pulse_pipeline: sorting for one pulse -> washing for one pulse -> drying for one pulse -> folding_packaging for one pulse
- live_order_placement: an order becomes eligible after its shift's production_run has started -> LPMS reads the versioned ordered batch queue and immutable resource snapshot -> pure online insertion computes an automatic or manager-exact placement proposal -> LPMS rejects hard-capacity violations and requests version-bound confirmation for overtime -> LPMS commits the placement and affected mutable suffix under the expected queue version -> LPMS records placement provenance and a work_event
- batch_membership_control: employee explicitly freezes a queued batch when physical grouping begins -> freezing anchors membership and queue position -> starting any batch implicitly and permanently freezes membership -> if queued unfreeze is enabled under the implementation assumption, it requires an authorized manager, confirmation, and audit -> non-queued batches cannot be unfrozen
- prestart_shift_revision: manager edits shift start, end, or effective folder count before execution exists -> LPMS locks the location scheduling scope and compares the shift version -> LPMS persists the complete shift settings and records one idempotent work_event -> a material change supersedes the current schedule revision and revokes acceptance -> a no-op preserves the current schedule revision -> manager computes a new immutable plan from the persisted shift facts
- production_workspace_live_refresh: a committed production work_event advances the owning location's durable live revision -> PostgreSQL notification wakes the authenticated location-authorized SSE stream -> the Processor coalesces the invalidation with any in-flight or post-command refresh -> the Processor reloads the authoritative workspace or board through its ordinary HTTP read -> initial connection, reconnect, or upstream-listener recovery also forces an authoritative resync
- floor_truth_recovery_after_reconnect: the backend becomes reachable after physical work continued or floor updates were missed -> the operator selects one batch, a strictly later milestone, a reason, an optional note, and machines only when the target leaves washing or drying active -> LPMS locks the run, batch, and canonical stages and validates exact queue, batch, and stage versions -> LPMS validates sequential progress, one active batch per stage kind, machine compatibility and availability, and hard capacity -> LPMS returns the exact projected effects and a canonical confirmation hash without mutating state -> operator confirmation recomputes and commits only when the hash and all versions remain current -> LPMS updates the current projection atomically, preserves unknown skipped boundaries, and appends one batch_progress_reconciled work_event -> the work_event advances one live revision and the Processor reloads the authoritative board
- order_level_routing: employee opens one order from the server-paginated Home projection -> queued rebatch requires an unfrozen queued source and an exact selected mutable queued target -> in-flight defer or rework selects a reason and restart stage that does not skip required work -> pure policy chooses the earliest feasible later batch for an in-flight route and validates whole-order hard capacity across the required stage suffix -> LPMS returns an exact version-bound proposal hash without mutation -> confirmation reloads and locks the current routing context, recomputes the proposal, and rejects drift -> one transaction releases the source membership and unfinished attempts, inserts the target membership and new attempts, updates aggregate weights and versions, and appends one order-routing work_event -> the Processor refreshes authoritative order and board projections
- production_history_review: authorized user opens the read-only History workspace -> LPMS returns bounded keyset pages for production runs, sanitized activity, or schedule plans -> cursors remain bound to the selected history view and filters -> opening a run loads batches, canonical stage progress, every historical order-membership episode, schedule lineage, and a bounded newest-first activity window -> raw work_event payloads and private idempotency data remain server-internal

## Vocabulary

- actor:operator: A person using LPMS to execute or confirm production-floor work.
- actor:manager: A person who can create, review, accept, and supervise production schedules and runs.
- actor:employee: A production worker who performs sorting, washing, drying, folding, or packaging work.
- external_system:cents: The v1 CRM/vendor system and external order authority for webhook-driven order demand.
- object:crm_order: The normalized projection of a Cents order; it is external demand, not production truth.
- object:production_order: The internal LPMS view of a CRM order that may become eligible for production scheduling.
- object:schedule_run: An immutable scheduler proposal containing input snapshot, output plan, hashes, score, and warnings.
- object:production_run: The sole execution aggregate for one production shift, created only when its current accepted schedule plan is started.
- object:production_batch: A real group of production orders moving together through the floor; it is not a washer load.
- object:stage_run: The state-machine owner for one physical process step of one production batch.
- object:stage_machine_assignment: A stage-level assignment of one physical machine to a stage run.
- object:machine: A physical constrained production resource such as a washer, dryer, or folding station.
- object:scheduler_config: Versioned configuration for pulse duration, folding rate, algorithm version, and scheduler behavior.
- object:work_event: The authoritative mutation ledger and audit trail for production changes.
- object:production_order_stage_attempt: A numbered assignment of one production_order to one canonical stage_run; its assignment identity is immutable, while its lifecycle closes as completed or released to preserve order routing history.
- states:schedule_run: draft, accepted, superseded, rejected
- states:production_run: planned, started, completed, canceled
- states:production_batch: queued, sorting, washing, drying, folding_packaging, finished, canceled, blocked
- states:stage_run: planned, started, completed, blocked, canceled

## Assumptions

- cents_price_weight_good_enough_v1: Cents price-derived weight is good enough for first-version scheduling.
- initial_fold_rate: Initial planning uses 2 pounds per effective folder minute, but the value remains configurable and must later be calibrated from observed production data.
- commercial_orders_low_volume_v1: Commercial orders are low enough volume in v1 to stay inside the same simple batching model.
- manual_stage_confirmation_is_acceptable_v1: Manual operator confirmation is acceptable as the source of stage completion truth in v1.
- manager_maps_to_owner_admin_v1: Existing owner and admin application roles act as the laundry-production manager for Accept, Start, exact placement, queued unfreeze, and overtime acceptance in v1.
- queued_unfreeze_is_manager_only_v1: A still-queued frozen batch may be explicitly unfrozen only by an owner or admin, with confirmation and audit; a non-queued batch can never be unfrozen.

## Open Questions

- exception_effects: How should manual holds, hard-confirmed cancellations, damaged items, missing bags, and empty source batches affect an accepted production_run and its planned resource reservations?
- role_permission_mapping: Does the v1 owner/admin-as-manager mapping match floor authority for Accept, Start, exact placement, queued unfreeze, and overtime acceptance?
- queued_unfreeze_authorization: Should a still-queued frozen batch be allowed to be unfrozen, and if so is owner/admin-only authorization correct?
