# Local Processor Empty-Slate Reset

## Purpose

Reset the confirmed native-WSL local Processor database to an empty operational
surface, then seed new synthetic Cents `SUBMITTED` observations through the
real durable ingress path.

This is a disposable-local administrative operation. It is not an Order,
Production, archive, or deletion command and must never be exposed as one.

## Exact target

- Docker context: `default`
- Compose project: `pressly`
- PostgreSQL container: `pressly-postgres-1`
- Database: `pressly`
- Location retained: `pressly-one`

AWS, `pressly-postgres-test-1`, customer data, and production deployment are
outside scope.

## Preserved state

- authentication and sessions;
- canonical Users and user source links;
- production location, stations, machines, scheduler configuration, and live
  revision;
- pricing and public configuration;
- source capability and control configuration;
- source-location bindings;
- processed webhook receipts and quarantine evidence; and
- resource-manifest and scheduler-configuration work events.

## Reset state

- incoming Order candidates, decisions, transitions, and tombstones;
- canonical Orders, fulfillments, source links and snapshots, command receipts,
  and outbox events;
- Production demand, intake, selection, schedules, runs, batches, stages,
  routing attempts, and order/run work events.

## Safety sequence

1. Inventory only aggregate counts and confirm the exact local dependency path.
2. Pause API, Worker, and Processor.
3. Create and verify a restorable local PostgreSQL backup.
4. Run the guarded reset SQL in one transaction.
5. Prove every Processor-facing Order and Production count is zero.
6. Restart the local services.
7. Send unique synthetic `SUBMITTED` observations through `/webhooks/cents`.
8. Prove the Worker creates pending candidates while canonical and Production
   Order counts remain zero.

No durable domain-memory update is warranted because this records transient
local test state, not a changed business belief.
