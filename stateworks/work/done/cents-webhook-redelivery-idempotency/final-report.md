# Cents Webhook Redelivery Idempotency Final Report

The generic webhook inbox now distinguishes immutable receipt identity from
adapter-owned normalized interpretation. Exact raw redelivery acknowledges the
existing durable event after adapter evolution; different raw bytes under one
deduplication identity still fail closed.

The patch requires no schema or production data migration. Its focused module,
PostgreSQL, API Cents boundary, architecture, type, lint, build, format,
Stateworks, and diff-hygiene gates pass in isolation. It must still be reviewed
and published, deploy through the protected main release path, and be observed
in production before the external issue is resolved.
