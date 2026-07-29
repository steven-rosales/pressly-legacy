# Order Management Context Pack

## Domain

Order Management (`order-management`)

## Summary

Durable business memory for source-neutral Pressly user profiles, commercial orders, fulfillment release, and external-source reconciliation. Authentication and laundry production remain separate peer domains.

## Invariants

- user_profile_exists_without_auth_identity: A canonical User profile may exist without credentials or a login, and linking an Auth identity to a User is explicit rather than inferred from contact information.
- source_identity_links_are_exact: External entities resolve through a unique source and external-identity link; source observations never select a canonical User or Order by fuzzy contact matching.
- contacts_never_silently_merge_users: Matching phone or email values may create a possible-duplicate signal but can never silently merge two canonical User profiles.
- source_observations_enter_through_commands: External webhooks enter through authenticated durable ingress and may produce only bounded source-neutral candidate-submit or candidate-source-close commands. They never emit a canonical User, Order, fulfillment, release, intake, Production, or floor command and never write canonical tables directly.
- order_identity_differs_from_display_number: A canonical Order ID and each external source ID remain stable identities, while the human-facing order number is a separate mutable display value with provenance.
- commercial_order_is_not_production_execution: Commercial Order lifecycle and fulfillment release cannot directly start, advance, finish, cancel, or rewind physical Production execution.
- fulfillment_release_is_source_neutral: Downstream execution receives a canonical fulfillment identity and source-neutral release state rather than a vendor lifecycle code.
- order_outbox_is_atomic: An Order mutation and every downstream outbox event caused by that mutation commit in the same database transaction.
- pressly_order_lifecycle_is_canonical_from_creation_v2: No external observation can create a canonical Order or select or execute a canonical transition. A pending incoming proposal becomes canonical only through an authorized Accept command; every later lifecycle change requires an authorized Pressly command or named versioned Pressly automation command.
- pressly_order_control_survives_source_loss_v1: An external source may be unavailable, quarantined, blocked, or detached without changing canonical identities or history and without preventing authorized Pressly creation, correction, lifecycle control, or peer-domain operational commands.
- incoming_proposal_decision_is_terminal_v1: The authoritative incoming-candidate graph is pending to accepted, rejected, or source_closed; source_closed to restored_pending; and restored_pending to accepted or rejected. Accepted and rejected are terminal, while restored_pending is a Pressly manager decision that later source observations cannot close or rewrite.
- incoming_proposal_identity_is_exact_v1: Exact source and external Order identity is the only automatic duplicate-suppression and canonical-link key; phone, email, name, display number, and fuzzy similarity never select, merge, or suppress records.
- incoming_proposal_decision_effects_v1: Accept atomically rechecks exact identity and expected version before creating one open canonical Order and unreleased fulfillment with command, source-link, transition, and outbox evidence. Reject creates no canonical User, Order, fulfillment, or downstream effect.
- cents_exact_submitted_is_candidate_only_v1: Only an exact raw Cents SUBMITTED Order observation may create one incoming candidate. Exact COMPLETED or CANCELED may record source closure, while every other status is acknowledged without candidate, canonical, fulfillment, or Production effect.
- incoming_candidate_source_closure_is_guarded_v1: Exact COMPLETED or CANCELED evidence may close only a pending candidate or create one exact-identity tombstone. It cannot mutate a restored_pending, accepted, or rejected candidate and cannot complete, cancel, release, withdraw, archive, restore, or delete canonical work.

## Policies

- cents_order_code_is_display_number_v1: The Cents orderCode is used as the human-facing order number, while Cents order.id is retained only as the exact external Order identity.
- cents_customer_resolution_v1: A Cents submitted candidate may carry an exact external customer identity and immutable customer snapshot. Only Accept may resolve or create the corresponding exact source-linked User, and contact values never select or merge a canonical User.
- source_snapshot_retention_v1: Pressly retains the immutable normalized candidate snapshot, append-only lifecycle transitions, terminal decision, exact source closure or tombstone evidence, and accepted source link. Raw webhook bodies remain only in encrypted, access-restricted, bounded quarantine.
- cents_submitted_candidate_boundary_v1: Cents may propose one immutable incoming candidate only at exact SUBMITTED and may report exact COMPLETED or CANCELED source closure. It has no field-following, canonical lifecycle, reconciliation, fulfillment release, cleanup-decision, or Production authority.

## Decisions

- users_orders_auth_and_production_are_peer_modules: Users, Orders, Auth, and Production remain isolated peer business modules inside the modular monolith and are composed only at application boundaries.
- orders_are_fulfillment_extensible: Orders owns generic items and fulfillment records; wash-and-fold is a fulfillment type consumed by Production rather than the shape of the Order aggregate.
- processor_uses_composed_order_views: Processor separates actionable pending or restored Incoming candidates, source-closed review, and canonical Current orders. It renders stable Order and customer identity, provenance, versions, source closure, and server-owned available actions without recreating lifecycle, duplicate, restore, or Production policy in the browser.
- order_management_is_not_event_sourced_v1: Canonical tables remain current state; incoming candidates keep immutable snapshots and versioned current state plus append-only transitions, terminal decisions, and exact source tombstones; accepted source links preserve provenance; and a transactional outbox distributes canonical changes. Aggregates are not reconstructed from a full event log.
- persistent_order_lifecycles_use_authoritative_graphs_v1: Each persistent Orders aggregate lifecycle is governed by one authoritative explicit state-and-event graph; use cases orchestrate graph decisions with effects, adapters and repositories cannot define parallel transition tables, and derived read states remain pure projections rather than additional lifecycle machines.
- source_lifecycle_anomalies_are_integration_context_v1: Exact SUBMITTED, COMPLETED, and CANCELED are translated into bounded candidate commands; every other Cents lifecycle value is minimized to an ignored durable receipt. No source value directly creates a canonical transition or Production-floor comparison.
- observation_and_command_channels_are_distinct_v1: External adapters may submit bounded pre-canonical proposals, while authorized first-party channels submit canonical aggregate commands directly; only an explicit Pressly command can create or transition canonical work.
- first_party_channels_use_canonical_commands_v1: Pressly-owned residential and commercial ordering surfaces invoke canonical User and Order commands directly instead of synchronizing through an external-source adapter; their authority remains bounded by actor permissions, fact ownership, concurrency, and aggregate lifecycle graphs and never grants production-floor truth.
- submitted_candidate_policy_lives_in_orders_v1: Orders owns exact-identity suppression, tombstones, the complete source-neutral candidate graph, Accept, Reject, Restore, canonical creation, receipts, and outbox effects. The Cents adapter owns only authentication, bounded classification, minimization, and transport.
- source_terminal_cleanup_is_composed_and_guarded_v1: When terminal evidence identifies exact accepted canonical work, an application composition boundary may invoke a named source-neutral Pressly resolution command. Production alone evaluates operational safety; Orders and the Cents adapter cannot infer or perform cleanup.

## Workflows

- direct_pressly_mutation: an authenticated first-party Pressly channel submits a task-shaped canonical create, correct, complete, cancel, release, withdraw, archive, restore, or other named command -> every command carries actor, authorization scope, origin, stable reason, idempotency key, and expected aggregate versions -> the owning use case locks and loads current canonical state -> the aggregate's authoritative lifecycle graph and policies decide the event and effects; callers cannot submit a target state -> the repository commits versioned canonical state, command receipt, audit evidence, and any source-neutral outbox event atomically -> adapter proposals and evidence remain separate and cannot mutate canonical state outside an accepted Pressly command
- cents_submitted_candidate_lifecycle: API authenticates one Cents envelope and records one idempotent durable inbox event with exact source identity and bounded evidence -> exact SUBMITTED is classified as candidate evidence, exact COMPLETED or CANCELED as terminal evidence, and every other known or unknown state as ignored evidence -> Worker translates classified evidence into source-neutral Orders commands and contains no candidate lifecycle or duplicate policy -> Orders serializes exact source and external Order identity; SUBMITTED creates at most one immutable pending candidate unless an exact canonical link or terminal tombstone already exists -> pending may accept, reject, or source_close; source_closed may restore to manager-owned restored_pending; restored_pending may accept or reject; accepted and rejected are terminal -> Accept rechecks exact identity and expected version and atomically creates one open canonical Order with an unreleased fulfillment, exact source link, decision receipt, and transactional outbox evidence -> Reject creates no canonical User, Order, fulfillment, or downstream effect -> terminal evidence closes only pending candidates or creates one tombstone; it cannot close restored_pending, accepted, rejected, or exact-linked canonical work

## Vocabulary

- external_system:cents: Cents is an external candidate-evidence provider. Exact raw SUBMITTED may propose one immutable incoming candidate, exact COMPLETED or CANCELED may record source closure, and every other status is acknowledged without an Orders command. Cents cannot create or transition canonical Pressly work.
- object:user_profile: A canonical Pressly person or business profile that may exist without authentication and may be linked to one or more exact external identities.
- object:commercial_order: A source-neutral customer order with a stable Pressly identity, human-facing order number, customer association, lifecycle, totals, and generic line items.
- object:order_fulfillment: A source-neutral unit of work required to fulfill a commercial order; its fulfillment type routes work to an execution capability without making the Order lifecycle specific to wash-and-fold.
- object:source_link: The exact mapping from one canonical entity to one source and external entity identity.
- object:source_snapshot: Immutable normalized source evidence retained when an incoming proposal is accepted and linked to a canonical entity; later adapter lifecycle deliveries do not update canonical work or this accepted evidence.
- object:order_outbox_event: A durable source-neutral event written atomically with an Order mutation and consumed idempotently by downstream capabilities.
- object:incoming_order_proposal: An immutable pre-canonical snapshot keyed by exact source and external Order identity with versioned current lifecycle state, append-only transition evidence, terminal decision evidence, and optional source-closure evidence. It has no canonical effect until an authorized Pressly decision.
- object:incoming_order_source_tombstone: Immutable exact source and external Order identity evidence that COMPLETED or CANCELED arrived before a candidate. It suppresses a later SUBMITTED proposal but creates no User, Order, fulfillment, release, or Production work.

## Assumptions

- None recorded.

## Open Questions

- manual_user_duplicate_resolution: What audited operator workflow should confirm or reject a possible duplicate and, if confirmed, move source links and dependent records without losing history?
