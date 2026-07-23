# LPMS Intake Admission Final Report

## Result

The Processor now has a dedicated Intake workspace and a source-neutral manual
Production admission override.

Authorized owners, administrators, and operators can release a lagging Cents
order into Pressly Production without mutating its Cents status. They can
reverse that decision only while the order remains unselected and uncommitted.

## Safety boundary

- Orders and Cents observations remain unchanged.
- Production owns executable admission and serializes it with scheduling.
- Physical intake remains required before an order can become executable.
- Manual release does not select or place an order.
- Open-shift selection, scheduling, and active placement block reversal.
- Source withdrawal overrides the manual release.

## Product boundary

Incoming work is now handled at `/intake` in three compact queues: Forecast
only, Needs intake, and Ready. Schedule remains a planning surface and
Production remains a live-run surface.

## Release cleanup

The release includes one idempotent data migration that removes prelaunch
Cents-only orders created before July 23, 2026 in America/New_York. It preserves
users, webhook audit history, post-cutoff orders, manual orders, and any order
linked to another source. Future Cents updates may recreate removed orders
through the normal ingestion workflow.

## Verification

The full repository test, typecheck, lint, architecture-boundary, database
migration, Postgres integration, Docker build, and local health checks passed.
