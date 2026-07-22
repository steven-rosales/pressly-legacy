# Source-Neutral Architecture Hardening

## Status

Completed local implementation follow-up to the source-neutral Users and
Orders slice. This work repairs the semantic boundary defects found by the
2026-07-21 hexagonal-architecture audit without changing confirmed Order or
Laundry Production policy.

The separate `lpms-order-control-correctness-hardening` work remains queued and
out of scope. This item does not claim production deployment or migration.

## Task Shape

This is a bounded cross-module refactor with authorization, durable delivery,
transaction ownership, API composition, and browser orchestration risk. It
deserves capability-shaped transactional ports and pure decisions inside use
cases. It does not justify a new service, message broker, generic repository
framework, or event sourcing.

## Outcome

- Canonical mutations authorize the actual User, Order, or Fulfillment
  resource rather than trusting only a route label.
- Success responses use the common API envelope.
- The Orders-to-Production integration event has one versioned contract.
- Poison outbox records reach an inspectable terminal state after bounded
  attempts instead of retrying forever.
- Users and Orders use cases own application decisions; Postgres adapters own
  locking, loading, mapping, and writing.
- Processor comparison reads typed source-neutral metadata instead of probing
  opaque vendor snapshots.
- Processor Order Control separates presentation, orchestration, and rendering.
- Architecture documentation and automated boundaries describe the deployed
  design accurately.

## Boundaries

- Preserve peer-module isolation; API and Worker remain composition roots.
- Preserve exact source identity, no silent User merge, field authority,
  monotonic source revisions, optimistic concurrency, and atomic Order outbox.
- Preserve release-gated Production admission and operator-confirmed floor
  truth.
- Do not alter whole-order routing, History pagination, or the queued
  correctness-hardening scope.
- Do not invent multi-fulfillment behavior. Record the single-fulfillment v1
  application constraint explicitly while retaining the extensible schema.
- No secret, customer payload, credential, or private token enters Stateworks.

## Minimum Architecture

```text
HTTP / Cents adapter
        |
        v
capability use case -> pure decision -> capability transaction port
                                         |
                                         v
                                      Postgres

Orders state + outbox --atomic--> versioned integration event
                                      |
                                      v
                               bounded Worker projector
                                      |
                                      v
                                  Production

typed Users + Orders + Production facts
        -> application read composition -> Processor presenter/model -> view
```

## Done Means

- Location and global authorization tests prove cross-location mutation is
  impossible.
- Invalid and exhausted outbox records terminalize with safe diagnostics and
  valid transient failures remain retryable.
- Use-case tests prove source ordering, authority, lifecycle, and effects using
  fake transactional ports rather than Postgres behavior.
- API, Worker, Orders, Users, Production, Processor, database, and architecture
  checks pass.
- Stateworks evidence distinguishes repository proof from deployment.
