# Cents Webhook Redelivery Idempotency Evidence

## T1 — Production diagnosis and repository repair

Status: committed.

Read-only production comparison established that current receipts normalize
exactly, while historical receipts received before the adapter authority
rewrite can produce different derived classification or canonical payload
from the same raw source bytes. The durable receipt already exists; duplicate
ingestion failed only because the repository compared those adapter-owned
derived values.

The repository now accepts the existing event when its raw-body fingerprint
matches and retains the invariant failure when the same source and
deduplication key refer to different source bytes. It does not rewrite the
stored event or reset inbox lifecycle state.

PostgreSQL proof covers:

- equal source, deduplication key, and raw fingerprint with changed normalized
  subject, location, timestamp, payload, and disposition returns the original
  event as a duplicate;
- equal source and deduplication key with a different raw fingerprint throws
  the stable duplicate-divergence invariant.

No production row, external issue, deployment, or dead letter was mutated.

## V1 — Verification

Status: committed.

Verification results:

- Focused PostgreSQL regression: 2 tests passed.
- Complete webhook-ingestion PostgreSQL integration: 10 tests passed across 5
  files.
- Complete webhook-ingestion unit suite: 16 tests passed across 9 files.
- API Cents boundary suite: 54 tests passed across 4 files.
- Webhook-ingestion typecheck, lint, and build passed.
- Repository architecture check, architecture lint, and format check passed.
- Stateworks network validation and completed-state verification passed with
  no stop reasons.
- Diff hygiene passed before commit.

The proof ran in an isolated worktree based on `origin/main`. It does not claim
that production is running this change, and it performed no production or
Sentry mutation.
