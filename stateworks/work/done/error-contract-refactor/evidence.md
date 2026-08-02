# Error Contract Refactor Evidence

Repository proof is separate from deployment, production data, and external
service proof.

## Work

- Work ID: `error-contract-refactor`
- Started: `2026-08-01`
- Finished: `2026-08-01`
- Durable domain-memory delta: none; business policy did not change.

## T0 — Baseline And Boundaries

Status: committed.

The baseline audit found four systemic inconsistencies:

- `@pressly/errors` did not cover its declared taxonomy and used one `details`
  field for both private diagnostics and public data.
- Web, Control, Processor, and CLI implemented incompatible HTTP response
  decoders and status mappings.
- Some API routes serialized `Result.err` directly, bypassing the central
  normalization, correlation, observation, and presentation boundary.
- Worker retry/reporting behavior was duplicated and could replace a primary
  failure, abandon peer work, or stop a polling loop when an observation sink
  failed.

The selected shape was a functional policy/interpreter flow:

```text
decode -> validate -> decide -> execute -> normalize once -> present once
```

Expected domain outcomes remain typed `Result` values. Unexpected
infrastructure and invariant failures remain throwable `AppError` values.
Shared packages own mechanisms; business modules retain semantic policy and
codes; applications interpret transport, reporting, retry, and UI behavior.

Pre-existing Processor refactor hunks, Web marketing assets, deleted SEO
documentation, and agent images remained user-owned and were not reverted.

## T1 — Shared Error, HTTP, Logging, And Observation Algebra

Status: committed.

- `@pressly/errors` now derives its taxonomy from readonly data, provides a
  semantic factory for every error kind, preserves causes and trace IDs, and
  distinguishes private `details` from explicit `publicDetails`.
- Private details are non-enumerable and safe presentation excludes them by
  default.
- `@pressly/http` now owns strict success/failure envelope decoding, exhaustive
  supported-status normalization, request-ID fallback, semantic remote error
  construction, and a pure discriminated JSON-body encoder.
- `@pressly/logging` redacts structured `AppError` diagnostics.
- `@pressly/metrics` provides `attemptObservation` plus isolated counter and
  measurement decorators, so best-effort sinks cannot replace authoritative
  outcomes.
- `@pressly/kernel` and `@pressly/db` use semantic invariant and infrastructure
  errors rather than anonymous native errors.

Focused proof:

- Errors: 27 tests.
- HTTP: 33 tests.
- Metrics: 17 tests.
- Logging: 6 tests.
- Kernel: 10 tests.
- Database: 41 tests.
- Auth package: 64 tests.
- Config: 2 tests.
- Focused package lint, typecheck, and builds passed.

## T2 — Module Failure Semantics

Status: committed.

- Business modules preserve an incoming `AppError` instead of overwriting its
  identity, cause, kind, code, status, or trace.
- Persistence and invariant failures are classified by semantic factory;
  expected business rejection remains in `Result`.
- Production routing and access guards no longer infer domain meaning from an
  HTTP status or map arbitrary persistence failures to conflicts.
- Caller-actionable password-strength and workforce-field validation facts are
  explicit `publicDetails`; authorization diagnostics remain private.
- Repeated wrapper transformations were consolidated into shared package
  mechanisms while domain-specific codes remain in their owning modules.

Focused module verification passed across 89 test files and 442 tests, with
module lint and typechecks also passing.

## T3 — Runtime, Client, And Worker Boundaries

Status: committed.

- API routes now hand failures to one error middleware. That boundary performs
  normalization, safe observation, request correlation, and serialization
  once; observation failures cannot replace the HTTP response.
- API startup and shutdown use a staged cleanup plan. Peer cleanup effects
  settle independently, later dependency stages still run, a startup failure
  remains primary, and Sentry flush is best-effort after the failure exit code
  is set.
- Web, Control, Processor, and CLI consume the shared response decoder and
  encode request JSON before entering transport error handling. Cyclic or
  unsupported local input is rejected locally and does not call `fetch`.
- Web timing, context, logging, and reporting are all non-authoritative; none
  can replace a successful query or its primary failure.
- Processor carries the canonical normalized status into its UI-specific
  request failure instead of pairing `unavailable` with a raw 200/418 status.
- UI runtimes retain narrow presentation wrappers around shared `AppError`
  data, and render/global error reporters cannot break recovery surfaces.
- Worker failure disposition is a pure policy. Claimed batches isolate peer
  failures, aggregate unexpected errors without dropping members, give
  unclassified failures bounded retries, and protect reporting, metrics,
  logging, lifecycle callbacks, and the polling loop from one another.
- CLI default output uses the safe public contract; diagnostic detail remains
  explicit.

Focused application proof:

- API: 192 tests.
- Web: 52 tests.
- Control: 80 tests.
- Processor: 275 tests.
- CLI: 36 tests.
- Worker: 64 tests.
- Focused application lint and typechecks passed.

## V1 — Repository Verification

Status: committed.

All required local checks exited successfully:

```text
pnpm lint
result: 27 Turbo lint tasks passed; browser tooling lint passed

pnpm typecheck
result: 48 Turbo typecheck/build tasks passed; browser tooling typecheck passed

pnpm test
result: 49 Turbo tasks passed; tooling suite passed 13 files and 201 tests

pnpm format:check
result: all matched files use repository formatting

git diff --check
result: no whitespace errors
```

The root test command now caps Turbo at two concurrent package tasks and each
Vitest instance at two workers. Turbo passes the Vitest cap through without
making it part of application behavior. The capped full run completed without
the prior WSL oversubscription failure.

Repository hygiene scans found:

- Five remaining native `Error` throws, all sealed shadcn-style UI provider
  assertions in Web or Processor.
- Generic `makeAppError` calls only inside the error package or structural
  normalization/sanitization boundaries in API and Worker.
- Direct `apiFailure` construction only at transport presentation boundaries,
  the health endpoint, CLI shell presentation, or the shared HTTP helper.

Architecture tests enforce those exceptions and reject new raw native throws
or generic error construction outside the declared boundaries.

Stateworks closeout proof:

```text
pnpm stateworks:validate stateworks/work/done/error-contract-refactor/network.yaml
result: valid network with 5 tasks

pnpm stateworks:verify stateworks/work/done/error-contract-refactor/network.yaml --state stateworks/work/done/error-contract-refactor/state.yaml
result: done yes; stop reasons none; next ready tasks 0
```

## Verification Boundary

This evidence proves repository behavior only. It does not claim deployment,
production traffic, external monitoring, customer data, or new business-policy
verification.
