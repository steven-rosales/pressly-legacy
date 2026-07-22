# Source-Neutral Users and Orders Final Report

Status: complete locally on 2026-07-21

## Outcome

Pressly now owns canonical Users and Orders independently of Cents, Auth, and
laundry Production. Every valid Cents Order is persisted exactly once by its
external source identity whether a customer is present or absent. A customer
with an exact Cents identity is resolved or created before the Order; a missing
customer remains an explicit nullable relationship rather than dropped or
guessed data.

Orders contain generic items and fulfillments instead of encoding wash-and-fold
as the aggregate shape. A transactional outbox projects released wash-and-fold
fulfillment demand into Production. Production is keyed by the canonical
fulfillment and no longer receives Cents lifecycle vocabulary as floor
authority.

## Consistency and ownership

- Auth owns credentials, sessions, roles, and authentication identities. Its
  optional User link is explicit; contact data never creates it implicitly.
- Users owns canonical profile facts, exact source links, source snapshots,
  field authority, consent history, and possible duplicate signals.
- Orders owns commercial Orders, generic items, fulfillments, exact source
  links, source snapshots, field authority, and its durable outbox.
- Production owns only laundry admission, physical intake, selection,
  scheduling, and floor execution.
- API and Worker own cross-module composition. Peer business modules remain
  dependency-isolated by architecture tests.

Direct Pressly mutations and source observations share the same versioned use
cases and idempotency receipts. The API and Worker supply trusted origin and
actor context; callers cannot self-declare it. Source updates are ordered by
revision and hash, and exact replay is idempotent.

## Cents and Processor behavior

All six currently documented Cents event kinds are normalized and processed.
`orderCode` is the human-facing Order number; Cents `order.id` remains only the
source identity. Customer name and phone flow through the canonical User into
an API-owned Processor read model without copying PII into Production.

The Processor now distinguishes commercial state, fulfillment admission,
source lifecycle, and LPMS floor truth. Unreleased orders stay forecast-only;
source completion never auto-completes physical LPMS work. English and Spanish
operator messages were updated together.

## Database and rollout

The implementation adds three forward migrations:

1. `0024_source-neutral-users-orders.sql`
2. `0025_source-neutral-production-demand.sql`
3. `0026_source-neutral-command-context.sql`

They expand and backfill without inventing legacy customer or `orderCode` data
and without destructive compatibility cleanup. Once applied outside a local
test database, rollback must be a forward compensating migration.

No production database migration, webhook replay, deployment, or live Cents
delivery occurred as part of this work. A release must apply the migrations in
journal order before starting the matching API and Worker images.

## Verification

Formatting, diff safety, all workspace lint and typecheck tasks, the full unit
suite, LPMS database integration suite, API/Processor end-to-end suites, 60
architecture-boundary tests, and local API/Worker/Processor container builds
all passed. Both changed Stateworks memory domains validate and regenerate
deterministically.

The separate queued `lpms-order-control-correctness-hardening` route-capacity,
between-stage routing, route-idempotency, and History cursor scope remains
unchanged and is not claimed complete here.
