# LPMS Run-Centered Online Scheduling Final Report

Status: complete

The run-centered implementation, full acceptance proof, canonical
documentation, and implementation-backed laundry-production memory are
complete. This closes repository work only; it does not advance the separate
production-readiness `H1` human gate.

## Implemented result

- Pre-start scheduling is split into `Compute -> Review/Accept -> Start`.
- Accept persists preference without creating execution; Start creates the
  shift's one production run directly in started state.
- Complete eligible-order snapshots, one-current-plan/one-run constraints,
  idempotency, and post-lock replay protect recompute and concurrent Start.
- Post-start arrivals use deterministic, zero-recourse online insertion into
  the existing run, with hard capacity and explicit pending outcomes.
- Queue composition is versioned. Frozen/in-flight work is anchored; exact
  placement and overtime confirmation are explicit, version-bound manager
  actions.
- API, Worker, and Processor use backend-owned shift/run identity. Processor
  resumes by URL, refreshes after commands, and polls rather than using SSE.
- Migration `0016_lpms-run-centered-online-scheduling` preserves readable
  history, normalizes compatible never-started legacy execution, and aborts on
  ambiguous or inconsistent execution.

## Verification status

All acceptance commands exited zero on the same checkout:

- Root typecheck: 43 of 43 tasks.
- Root lint: 24 of 24 tasks.
- Root tests: 149 files and 814 tests.
- Root build: 24 of 24 tasks.
- Canonical LPMS integration: 36 files and 153 tests.
- Canonical LPMS end-to-end: 13 files and 86 tests.
- Drizzle schema/migration consistency and `git diff --check`: passed.
- Stateworks lifecycle: `done: yes`, no stop reasons, zero ready tasks.

Counts are command-local and are not summed because the root, integration, and
end-to-end gates intentionally overlap.

The disposable production-topology smoke proof exited zero. Its redacted report
is `/tmp/pressly-v2-smoke-1000-302529-report.json` (4563 bytes; SHA-256
`152592623a0773563e3382a7c8030f5cd18f271e2507e851a52182f0e0e16033`). Two
signed synthetic Cents receipts became two finished orders in exactly one
completed run, covering automatic placement, explicit freeze, run-ID resume,
four stages/eight commands, database durability, release-B switch,
release-A rollback, and zero remaining Docker resources.

The final requirement audit additionally proved race-safe unique-run selection,
strict unknown/cross-location shift 404 behavior, board intake visibility and
refresh, and location-change URL identity reset.

## Release and memory posture

Do not deploy this intentionally breaking contract as independent components;
Database migration, API, Worker, and Processor require a coordinated release.
The implementation delta is applied, laundry-production memory is v6, and the
bounded context pack matches the verified implementation.

Owner/admin manager mapping and queued-only unfreeze remain implementation
assumptions pending floor confirmation. SSE, probabilistic stability scoring,
silent live optimization, automatic repacking, drag-and-drop/pagination, split
orders, full event sourcing, and new exception workflows remain deferred.

The separate `lpms-production-readiness` work remains active at its human `H1`
gate. This implementation's V1 proof is appended there as the required
post-change local/RV1 reference without rewriting its historical evidence or
claiming live vendor, cloud, secret, deployment, or pilot completion.

Result: complete.
