# Order Management Context Pack

## Domain

Order Management (`order-management`)

## Summary

Durable business memory for source-neutral Pressly user profiles, commercial orders, fulfillment release, and external-source reconciliation. Authentication and laundry production remain separate peer domains.

## Invariants

- user_profile_exists_without_auth_identity: A canonical User profile may exist without credentials or a login, and linking an Auth identity to a User is explicit rather than inferred from contact information.
- source_identity_links_are_exact: External entities resolve through a unique source and external-identity link; source observations never select a canonical User or Order by fuzzy contact matching.
- contacts_never_silently_merge_users: Matching phone or email values may create a possible-duplicate signal but can never silently merge two canonical User profiles.
- source_observations_enter_through_commands: Webhooks and other external channels submit validated observations through application commands and never write canonical User or Order tables directly.
- source_revision_order_is_monotonic: For one exact source entity, older revisions are ignored, exact revision-and-hash replays are idempotent, and equal revisions with different hashes are recorded as conflicts rather than resolved by last-write-wins.
- order_identity_differs_from_display_number: A canonical Order ID and each external source ID remain stable identities, while the human-facing order number is a separate mutable display value with provenance.
- commercial_order_is_not_production_execution: Commercial Order lifecycle and fulfillment release cannot directly start, advance, finish, cancel, or rewind physical Production execution.
- fulfillment_release_is_source_neutral: Downstream execution receives a canonical fulfillment identity and source-neutral release state rather than a vendor lifecycle code.
- order_outbox_is_atomic: An Order mutation and every downstream outbox event caused by that mutation commit in the same database transaction.
- source_observation_and_lifecycle_adoption_are_separate_v1: Every valid newer external lifecycle observation is retained under source revision rules even when its lifecycle value is observation-only and is not adopted into canonical Pressly state.
- pressly_order_lifecycle_is_canonical_after_handoff_v1: Once a fulfillment crosses the Pressly handoff, an external source observation cannot rewind, complete, cancel, withdraw, or otherwise terminalize canonical Pressly Order or fulfillment lifecycle; only an explicit Pressly command or separately modeled compensation workflow may change it.

## Policies

- canonical_field_authority_v1: A direct Pressly edit becomes the canonical authority for that field until an explicit follow-source command restores source authority; later source values remain retained and inspectable in the latest snapshot.
- cents_order_code_is_display_number_v1: The Cents orderCode is used as the human-facing order number, while Cents order.id is retained only as the exact external Order identity.
- cents_customer_resolution_v1: Cents customer observations and embedded order customers resolve or create a User through the exact Cents customer ID before the Order is recorded; contact values only produce possible-duplicate signals.
- cents_fulfillment_release_mapping_v1: Cents states before IN_PROGRESS describe prospective demand; cancellation may withdraw that demand before handoff, while the first IN_PROGRESS-or-later non-canceled observation may release an unreleased fulfillment exactly once. After handoff, every later Cents lifecycle value is retained as source metadata but is observation-only for canonical Pressly lifecycle.
- source_snapshot_retention_v1: Pressly retains the latest normalized source snapshot permanently for each linked entity and retains raw webhook bodies only in encrypted, access-restricted, bounded quarantine.

## Decisions

- users_orders_auth_and_production_are_peer_modules: Users, Orders, Auth, and Production remain isolated peer business modules inside the modular monolith and are composed only at application boundaries.
- orders_are_fulfillment_extensible: Orders owns generic items and fulfillment records; wash-and-fold is a fulfillment type consumed by Production rather than the shape of the Order aggregate.
- mutation_channels_share_use_cases: Webhooks, dashboards, customer accounts, and future channels invoke the same canonical User and Order use cases with explicit origin, actor, idempotency, and concurrency metadata.
- processor_uses_composed_order_views: Processor queries compose User contact data, Order commercial data, and Production floor data in an application-owned read model without transferring write authority between modules.
- order_management_is_not_event_sourced_v1: Canonical tables remain current state, source snapshots preserve external observations, and a transactional outbox distributes changes; v1 does not reconstruct aggregates from a full event log.
- persistent_order_lifecycles_use_authoritative_graphs_v1: Each persistent Orders aggregate lifecycle is governed by one authoritative explicit state-and-event graph; use cases orchestrate graph decisions with effects, adapters and repositories cannot define parallel transition tables, and derived read states remain pure projections rather than additional lifecycle machines.
- source_lifecycle_anomalies_are_integration_context_v1: Source lifecycle differences after the Pressly handoff are retained for integration health and audit review and are not exposed as production-floor comparison tasks.

## Workflows

- cents_order_observation: API authenticates and validates one Cents webhook envelope and records one idempotent inbox event -> Worker resolves the exact source location and converts the Cents payload into typed source observations, retaining the raw lifecycle code as source metadata -> Users resolves the exact Cents customer identity, applies non-overridden fields, retains the latest customer snapshot, and records any possible duplicate -> Orders locks the exact source identity and classifies the source revision as stale, replay, conflict, or valid newer observation -> Orders retains every valid newer normalized snapshot independently from whether its values are adopted into canonical Pressly fields -> source-owned non-lifecycle fields may be adopted under their existing field-authority and source-revision rules -> before handoff, prospective Cents lifecycle may leave fulfillment unreleased or withdraw uncommitted demand -> the first IN_PROGRESS-or-later non-canceled observation may advance an unreleased fulfillment through the one-way Pressly handoff -> after handoff, later Cents lifecycle values are observation-only and cannot rewind, complete, cancel, or withdraw canonical Pressly lifecycle -> Orders writes a fulfillment-demand outbox event in the same transaction only when canonical demand or adopted fields change -> Worker claims the outbox event and applies source-neutral fulfillment demand to Production idempotently -> Processor floor views use canonical Pressly lifecycle and server-owned action availability; source lifecycle anomalies remain integration and audit context
- direct_pressly_mutation: authorized Pressly channel submits a typed command with actor, origin, idempotency key, and expected aggregate version -> User or Order use case loads current canonical state and source authority -> the authoritative lifecycle graph and pure field policies validate the command and derive the next state and effects -> repository commits the versioned canonical change and any outbox event atomically -> source snapshots remain unchanged and any difference remains inspectable as integration or audit context without becoming production-floor work

## Vocabulary

- external_system:cents: An external source of customer, order, marketing-consent, and lifecycle observations; it is not Pressly's canonical database or production-floor authority.
- object:user_profile: A canonical Pressly person or business profile that may exist without authentication and may be linked to one or more exact external identities.
- object:commercial_order: A source-neutral customer order with a stable Pressly identity, human-facing order number, customer association, lifecycle, totals, and generic line items.
- object:order_fulfillment: A source-neutral unit of work required to fulfill a commercial order; its fulfillment type routes work to an execution capability without making the Order lifecycle specific to wash-and-fold.
- object:source_link: The exact mapping from one canonical entity to one source and external entity identity.
- object:source_snapshot: The durable latest normalized representation, revision, schema version, and payload hash observed for one linked external entity.
- object:order_outbox_event: A durable source-neutral event written atomically with an Order mutation and consumed idempotently by downstream capabilities.

## Assumptions

- None recorded.

## Open Questions

- manual_user_duplicate_resolution: What audited operator workflow should confirm or reject a possible duplicate and, if confirmed, move source links and dependent records without losing history?
