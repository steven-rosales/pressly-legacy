# API and Worker Executable-Edge Architecture Final Report

Status: complete locally on 2026-07-22

## Outcome

API and Worker now expose the architecture their functions actually require.
Both processes have minimal entrypoints, explicit composition roots, closed
runtime foundations, and delivery/work slices named for the capability they
serve. Canonical Orders and Users remain peer business modules rather than
Processor subcomponents, and Production remains source-neutral.

The API owns HTTP mechanisms and trust boundaries; bootstrap alone connects
peer routes and module ports. The Worker owns two durable jobs—webhook inbox
processing and fulfillment-demand projection—while polling, retry, heartbeat,
cancellation, and telemetry remain generic runtime mechanics. Cents is a
private adapter of webhook intake, not a top-level application architecture.

The production topology bootstrap command now belongs to CLI, though its built
artifact remains available in the production API operations image. Unsupported
unwired reconciliation code and dormant security placeholders are gone.
Documentation and 68 deterministic architecture tests prevent the old
catch-all directory shape and dependency leaks from returning.

## Verification

Repository lint, typecheck, full unit/tooling tests, focused application tests,
CLI command tests, and the combined API/Worker/CLI build graph all passed.
Exact counts and commands are recorded in `evidence.md`.

The disposable live Docker topology smoke was attempted but could not begin
because the local Docker CLI did not return context or server information. This
is recorded as an environmental limitation, not a passing container proof.
Static topology tests, production artifact-path checks, and application builds
passed. No deployment, migration, webhook replay, secret access, or external
mutation occurred.
