# Source-Neutral Users and Orders

Date: 2026-07-20
Domain: order-management
Topic: Canonical user profiles, orders, fulfillment release, and source reconciliation

## Sources

- Conversation with Steven about retaining all useful Cents webhook data while
  making Users and Orders independent of Cents and of laundry production.
- Repository inspection of the current Cents adapter, webhook inbox, Auth,
  Production demand projection, database schema, module-isolation checks, and
  `@pressly/kernel` primitives.
- Existing laundry-production memory governing source-versus-floor authority.

## Confirmed Facts

- Cents delivers separate order, customer, and marketing webhook events rather
  than one combined business snapshot.
- The current adapter processes only order events; customer and marketing events
  are acknowledged as ignored.
- The current Production demand projection stores vendor-derived lifecycle and
  display data directly, and the Cents worker maps `IN_PROGRESS` into a
  Production-specific release phase.
- `auth_identities` currently combines login identity with basic display fields;
  there is no source-neutral User profile module.
- The webhook quarantine retains encrypted raw bodies for bounded diagnosis, but
  the durable canonical model does not retain a complete latest source snapshot.

## Confirmed Decisions

- A canonical User profile may exist without a login. Auth remains a separate
  capability and may link explicitly to a User profile.
- External systems and Pressly applications submit commands or observations;
  they do not write canonical tables directly.
- Exact source identity links resolve external users and orders. Phone and email
  can identify possible duplicates but never silently merge canonical Users.
- Direct Pressly edits are explicit canonical overrides. Later source updates
  remain visible in source snapshots and do not overwrite an overridden field
  until an explicit follow-source action restores source authority.
- Cents `order.id` is an external identity. Cents `orderCode` is the human-facing
  order number.
- A commercial Order is separate from its fulfillment work. The Order model is
  not wash-and-fold-specific; a fulfillment type selects a downstream execution
  capability.
- Raw Cents lifecycle values remain source metadata. Cents `IN_PROGRESS` maps at
  the adapter boundary to a source-neutral fulfillment release. Production does
  not receive or interpret the string `IN_PROGRESS`.
- A downstream or completed Cents status may change commercial/source state and
  create a comparison signal, but it cannot finish Laundry Production without
  LPMS confirmation of physical truth.
- Every mutation channel uses idempotent commands, origin and actor provenance,
  source revision ordering where applicable, and optimistic aggregate versions.
- The Orders transaction writes the canonical mutation and its outbox event
  atomically. Production consumes that event idempotently.
- Keep one permanent latest normalized source snapshot per linked external
  entity. Keep raw webhook bodies encrypted and bounded by quarantine retention.
- Processor order views compose User, Order, and Production facts; they do not
  make one module own another module's state.

## Concurrency and Conflict Rules

- An older source revision is ignored.
- An exact repeated source revision and payload hash is idempotent.
- The same source revision with a different payload hash is a conflict requiring
  inspection rather than last-write-wins.
- Direct Pressly mutations compare the expected canonical aggregate version.
- A User is resolved before its Order is recorded. If the Order step fails, a
  webhook retry safely reuses the already-created User and completes the Order.

## Architecture Boundary

- `modules/business/users` owns canonical profiles, source links, source
  snapshots, field authority, and consent history.
- `modules/business/orders` owns canonical commercial orders, generic items,
  fulfillment records, source links, source snapshots, and the transactional
  order outbox.
- `modules/business/auth` owns credentials, sessions, MFA, and authorization
  identity; it may hold an optional reference to a canonical User.
- `modules/business/production` owns physical laundry execution and consumes
  only a source-neutral fulfillment demand projection.
- Applications compose peer modules. Business modules do not import one another.

## Explicitly Deferred

- Automatic User merging or a generic entity-resolution engine.
- A full event-sourced architecture or external message broker.
- Dry-cleaning execution behavior.
- Splitting the modular monolith into independently deployed services.
- A broad generic outbox framework before a second concrete producer needs it.

## Candidate Memory Deltas

- `stateworks/memory/domains/order-management/deltas/2026-07-20-source-neutral-users-orders.memory-delta.yaml`
- `stateworks/memory/domains/laundry-production/deltas/2026-07-20-source-neutral-order-boundary.memory-delta.yaml`
