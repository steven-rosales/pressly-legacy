# Error Contract Refactor

## Status

Completed repository refactor. This work improves error semantics, transport
contracts, observability, and retry behavior without changing Pressly business
policy or implementing the deferred fulfillment and Driver roadmap.

## Task Shape

Errors cross pure domain decisions, persistence, HTTP, background jobs, UI
clients, and process lifecycle boundaries. The smallest coherent design is a
shared error and HTTP algebra with runtime-specific interpreters:

```text
decode -> validate -> decide -> execute -> normalize once -> present once
```

- Expected outcomes remain typed `Result` values.
- Unexpected infrastructure and invariant failures remain throwable
  `AppError` values.
- Shared packages own reusable constructors, decoding, and safe presentation.
- Business modules own domain-specific codes and failure meaning.
- Apps own transport, reporting, retry, and user-presentation policy.

No error manager, base-class hierarchy, global event bus, or generic workflow
framework is justified.

## Observable Outcome

- Equivalent failures have one stable kind and HTTP status.
- Existing `AppError` values survive module and adapter boundaries intact.
- API failures are normalized, observed, correlated, and serialized exactly
  once.
- Private diagnostics never enter public API envelopes by default.
- Web, Control, Processor, and CLI decode one canonical response contract.
- Worker retry and dead-letter decisions are pure, explicit, and tested.
- Default CLI output is safe; diagnostic output is opt-in.

## Existing Worktree Boundary

Pre-existing Processor refactor changes, Web marketing assets, deleted SEO
documentation, and agent images are user-owned. This work may make narrowly
scoped error-contract edits to an already modified Processor file, but must
preserve all unrelated hunks.

## Non-Goals

- No business-domain redesign.
- No production deployment, database migration, or external Sentry change.
- No blanket prohibition on native `Error` in tests, tooling, generated UI,
  or local programmer assertions.
- No implementation of the later service-fulfillment or Driver roadmap.
