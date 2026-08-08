# Cents Webhook Redelivery Idempotency

Production telemetry showed that an exact historical Cents receipt could be
rejected after the adapter's normalized payload evolved. The durable raw
receipt remained unchanged, but generic inbox ingestion compared derived
fields from two adapter versions and treated the difference as corruption.

This package makes the raw receipt the immutable duplicate fingerprint. An
exact raw redelivery acknowledges the original inbox event; reusing the same
deduplication identity for different raw bytes still fails closed.

The change is repository-only. It does not modify production data, replay a
dead letter, deploy a release, or resolve an external issue.
