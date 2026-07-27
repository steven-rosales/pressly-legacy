# LPMS Operational Authority and Remaining-Day Forecast Final Report

## Result

Status: done.

Pressly is now the canonical operational authority after the one-way source
handoff. Valid newer Cents observations remain retained, but later source
lifecycle values cannot rewind, complete, cancel, withdraw, or otherwise
change Pressly execution.

Persistent Orders and Production lifecycles now use explicit aggregate-owned
state-and-event graphs. Derived readiness, attention, placement, and forecast
classifications remain pure projections rather than parallel state machines.

## Production and Planning

- Production-order execution is separated from derived readiness.
- Finished Pressly work remains historical and is excluded from forward
  demand.
- The remaining-day forecast is deterministic, read-only, and available at
  `/forecast`.
- Home keeps a compact remaining-day summary.
- Schedule owns explicit post-start placement into the existing production
  run without recomputing the accepted plan or moving existing work.
- Production remains centered on physical queue and stage execution.
- Intake uses the established five-column operational layout and ordinary
  action column.

## Processor

The Processor uses server-owned action availability and Pressly-native
operational language. Source-versus-Pressly comparison work no longer appears
on floor surfaces.

Live placement uses the existing server recommendation or an explicit
manager-selected mutable batch with exact capacity, queue-version, batch
version, and overtime consequences. Forecast date selection uses the shared
shadcn Calendar and Popover. Desktop and mobile navigation follow the physical
workflow while keeping Home standalone.

## Verification

Focused Orders, Worker, Production policy, scheduling, Production business,
contracts, database, API, and Processor tests passed. Repository typecheck,
lint, formatting, build, and whitespace checks passed.

The local production Processor bundle and Docker service were rebuilt.
Recorded desktop and mobile review covered Schedule, exact placement,
Production handoff, Forecast calendar behavior, responsive overflow, focus
return, and a clean browser console.

## Dependent Work

`lpms-order-control-correctness-hardening` was rebaselined and remains queued
to reproduce and repair its four known route and History correctness gaps.
The production-readiness repository proof affected by this changed baseline is
invalidated; live Cents, deployment, and pilot gates remain stopped.

The separately queued production-order resolution and row-identity package
must execute after correctness hardening or an explicit fresh rebaseline.

## Evidence Boundary

This report proves repository behavior and the recorded local runtime only. It
does not prove deployment, production data, the live Cents contract, retention
policy, or pilot readiness.
