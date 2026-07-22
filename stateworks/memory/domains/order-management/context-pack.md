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

## Policies

- canonical_field_authority_v1: A direct Pressly edit becomes the canonical authority for that field until an explicit follow-source command restores source authority; later source values remain retained and inspectable in the latest snapshot.
- cents_order_code_is_display_number_v1: The Cents orderCode is used as the human-facing order number, while Cents order.id is retained only as the exact external Order identity.
- cents_customer_resolution_v1: Cents customer observations and embedded order customers resolve or create a User through the exact Cents customer ID before the Order is recorded; contact values only produce possible-duplicate signals.
- cents_fulfillment_release_mapping_v1: Cents states before IN_PROGRESS leave the fulfillment unreleased, IN_PROGRESS and later non-canceled states leave it released, and cancellation withdraws it; the raw Cents state remains source metadata outside Production.
- source_completion_requires_floor_comparison_v1: A source that reports downstream or completed work may update commercial and source records, but unfinished Production remains unchanged and is surfaced for operator comparison.
- source_snapshot_retention_v1: Pressly retains the latest normalized source snapshot permanently for each linked entity and retains raw webhook bodies only in encrypted, access-restricted, bounded quarantine.

## Decisions

- users_orders_auth_and_production_are_peer_modules: Users, Orders, Auth, and Production remain isolated peer business modules inside the modular monolith and are composed only at application boundaries.
- orders_are_fulfillment_extensible: Orders owns generic items and fulfillment records; wash-and-fold is a fulfillment type consumed by Production rather than the shape of the Order aggregate.
- mutation_channels_share_use_cases: Webhooks, dashboards, customer accounts, and future channels invoke the same canonical User and Order use cases with explicit origin, actor, idempotency, and concurrency metadata.
- processor_uses_composed_order_views: Processor queries compose User contact data, Order commercial data, and Production floor data in an application-owned read model without transferring write authority between modules.
- order_management_is_not_event_sourced_v1: Canonical tables remain current state, source snapshots preserve external observations, and a transactional outbox distributes changes; v1 does not reconstruct aggregates from a full event log.

## Workflows

- cents_order_observation: API authenticates and validates one Cents webhook envelope and records one idempotent inbox event -> Worker resolves the exact source location and converts the Cents payload into typed source observations -> Users resolves the exact Cents customer identity, applies non-overridden fields, retains the latest customer snapshot, and records any possible duplicate -> Orders resolves the exact Cents order identity, records orderCode, generic items, fulfillment, lifecycle, and the latest order snapshot -> Orders writes any fulfillment-demand outbox event in the same transaction as the canonical Order mutation -> Worker claims the outbox event and applies the source-neutral fulfillment demand to Production idempotently -> Processor reads compose User, Order, and Production state and surface disagreements without changing floor truth
- direct_pressly_mutation: authorized Pressly channel submits a typed command with actor, origin, idempotency key, and expected aggregate version -> User or Order use case loads current canonical state and source authority -> pure policy validates the command and derives the next state and effects -> repository commits the versioned canonical change and any outbox event atomically -> source snapshots remain unchanged and any resulting source disagreement stays visible

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
