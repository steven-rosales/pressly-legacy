# Local Processor Empty-Slate Reset Final Report

## Outcome

The confirmed native-WSL local Processor database was backed up, reset to zero
Processor-facing operational records, and reseeded through normal durable
Cents ingress.

The resulting local state contains:

- 6 pending synthetic Incoming candidates;
- 0 canonical Orders;
- 0 fulfillments;
- 0 Production Orders;
- 0 shifts, schedules, runs, batches, or stages; and
- healthy API, Worker, Processor, and PostgreSQL services.

The candidates are intentionally pre-canonical. Accept or Reject in Processor
now exercises the authoritative candidate graph from a clean slate.

## Recovery

The verified pre-reset custom-format backup remains at:

`/tmp/pressly-local-processor-reset-20260729T135142/pressly-before-reset.dump`

SHA-256:

`7d41c70ce5fa8ba04651331f78be233250104f5338b3da17cb8a207ee03605c7`

## Boundaries

- AWS and the test database were untouched.
- Auth, Users, equipment, scheduler configuration, pricing, source
  configuration, source-location binding, processed webhook receipts, and
  configuration audit evidence were preserved.
- No deployment or durable domain-memory change was made.
