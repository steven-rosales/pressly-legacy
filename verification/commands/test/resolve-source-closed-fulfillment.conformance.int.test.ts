import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PostgresDatabase } from '@pressly/postgres/client';
import { asc, eq, sql } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import type { IdSource } from '@pressly/cells/id-source';
import type { Result } from '@pressly/cells/result';
import {
  makeProductionSystem,
  type ProductionSystemSignals,
  type ProductionSystemUnitOfWorkObserver,
} from '@pressly/production-system/testing/assembly';
import type { ResolveSourceClosedFulfillmentCommand } from '@pressly/production-system/operations/demand/resolve-source-closed-fulfillment/types';
import {
  createTestDatabaseRuntime,
  type TestDatabaseRuntime,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  resolveSourceClosedFulfillmentConformanceDueAt as dueAt,
  resolveSourceClosedFulfillmentConformanceIds as ids,
  resolveSourceClosedFulfillmentConformanceInitialTime as initialTime,
  resolveSourceClosedFulfillmentConformanceLocationId as locationId,
  resolveSourceClosedFulfillmentConformanceNow as now,
  resolveSourceClosedFulfillmentConformanceScenarios,
  type ResolveSourceClosedFulfillmentConformanceScenario,
} from '../src/public.ts';
import { seedProductionLocationConformanceFacts } from '../src/production-location-conformance.postgres.ts';
import { productionCommandSystemDependencies } from '../src/production-command-system-dependencies.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const adminDatabaseUrl =
  process.env['PRESSLY_SOURCE_CLOSED_CONFORMANCE_ADMIN_DATABASE_URL'] ??
  'postgres://pressly:pressly@localhost:55434/postgres';

const tableNames = [
  'work_events',
  'production_order_stage_attempts',
  'stage_machine_assignments',
  'stage_runs',
  'production_batch_orders',
  'production_batches',
  'production_runs',
  'schedule_runs',
  'production_shift_selected_orders',
  'production_shift_selections',
  'scheduler_configs',
  'production_machines',
  'production_stations',
  'production_bags',
  'production_orders',
  'production_shifts',
  'order_demands',
  'production_locations',
] as const;

const run = (executable: string, args: readonly string[], env = process.env) =>
  execFileSync(executable, [...args], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 180_000,
  });

const databaseUrl = (name: string): string => {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${name}`;
  url.search = '';
  return url.toString();
};

const dropDatabase = (name: string): void => {
  run('dropdb', [
    '--maintenance-db',
    adminDatabaseUrl,
    '--if-exists',
    '--force',
    name,
  ]);
};

const createDatabase = (name: string): void => {
  run('createdb', [
    '--maintenance-db',
    adminDatabaseUrl,
    '--template',
    'template0',
    name,
  ]);
  run('pnpm', ['db:migrate'], {
    ...process.env,
    DATABASE_URL: databaseUrl(name),
    NODE_ENV: 'test',
  });
};

const databaseExists = (name: string): boolean =>
  run('psql', [
    adminDatabaseUrl,
    '-Atqc',
    `select datname from pg_database where datname = '${name}'`,
  ]).trim() === name;

type ConformanceDatabase = TestDatabaseRuntime &
  Readonly<{ name: string; url: string }>;

const makeConformanceDatabase = (): ConformanceDatabase => {
  const suffix = `${process.pid}_${Date.now().toString(36)}`;
  const name = `pressly_srcclose_conformance_test_${suffix}`;
  const url = databaseUrl(name);
  return Object.freeze({
    name,
    url,
    ...createTestDatabaseRuntime({
      databaseUrl: url,
      tableNames,
      maxConnections: 10,
    }),
  });
};

const database = makeConformanceDatabase();

const relaxFaultFixtureConstraints = async (
  db: PostgresDatabase,
): Promise<void> => {
  await db.execute(
    sql`alter table production_orders drop constraint if exists production_orders_resolution_state_valid`,
  );
  await db.execute(
    sql`alter table production_orders drop constraint if exists production_orders_resolution_metadata_consistent`,
  );
  await db.execute(
    sql`alter table order_demands drop constraint if exists order_demands_admission_state_valid`,
  );
};

const setupDatabase = async (database: ConformanceDatabase): Promise<void> => {
  dropDatabase(database.name);
  createDatabase(database.name);
  await database.check();
  await relaxFaultFixtureConstraints(database.db);
};

const restoreCandidateTableName = async (
  db: PostgresDatabase,
): Promise<void> => {
  await db.execute(sql`
    do $$
    begin
      if to_regclass('public.order_demands') is null
        and to_regclass('public.order_demands_source_close_fault') is not null
      then
        alter table order_demands_source_close_fault rename to order_demands;
      end if;
    end
    $$
  `);
};

const removeFaults = async (db: PostgresDatabase): Promise<void> => {
  await restoreCandidateTableName(db);
  await db.execute(
    sql`drop trigger if exists source_close_late_cas on production_orders`,
  );
  await db.execute(
    sql`drop function if exists source_close_reject_order_update()`,
  );
};

beforeAll(async () => {
  await setupDatabase(database);
});

afterAll(async () => {
  await removeFaults(database.db);
  await database.close();
  dropDatabase(database.name);
  expect(databaseExists(database.name)).toBe(false);
}, 30_000);

type CanonicalFailure = Readonly<{
  kind: string;
  code: string;
  message: string;
  safeMessage: string | null;
  status: number | null;
}>;

type CanonicalOutcome =
  | Readonly<{ kind: 'success'; value: unknown }>
  | Readonly<{ kind: 'failure'; failure: CanonicalFailure }>
  | Readonly<{ kind: 'unexpected'; error: CanonicalFailure }>;

type TransactionTrace = Readonly<{
  operation: string;
  outcome: 'committed' | 'expected_rollback' | 'failed';
}>;

type DurableSnapshot = Readonly<{
  order: unknown | null;
  demand: unknown | null;
  events: readonly unknown[];
  liveRevision: number;
}>;

type ConformanceObservation = Readonly<{
  outcomes: readonly CanonicalOutcome[];
  state: Readonly<{ before: DurableSnapshot; after: DurableSnapshot }>;
  generatedIds: readonly string[];
  clockReads: readonly string[];
  transactions: readonly TransactionTrace[];
  signals: readonly string[];
  nestedCommands: readonly unknown[];
}>;

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const stringField = (
  value: Readonly<Record<string, unknown>> | null,
  field: string,
  fallback: string,
): string => {
  const candidate = value?.[field];
  return typeof candidate === 'string' ? candidate : fallback;
};

const canonicalFailure = (value: unknown): CanonicalFailure => {
  const fields = record(value);
  return Object.freeze({
    kind: stringField(fields, 'kind', 'unknown'),
    code: stringField(fields, 'code', 'unknown_error'),
    message:
      value instanceof Error
        ? value.message
        : stringField(fields, 'message', 'Unknown error.'),
    safeMessage:
      typeof fields?.['safeMessage'] === 'string'
        ? fields['safeMessage']
        : null,
    status: typeof fields?.['status'] === 'number' ? fields['status'] : null,
  });
};

const captureOutcome = async (
  execute: (command: ResolveSourceClosedFulfillmentCommand) => Promise<unknown>,
  command: ResolveSourceClosedFulfillmentCommand,
): Promise<CanonicalOutcome> => {
  try {
    const raw = await execute(command);
    const wrapper = record(raw);
    if (wrapper?.['tag'] === 'err')
      return {
        kind: 'failure',
        failure: canonicalFailure(wrapper['error']),
      };
    if (wrapper?.['kind'] === 'failure')
      return {
        kind: 'failure',
        failure: canonicalFailure(wrapper['failure']),
      };
    return {
      kind: 'success',
      value:
        wrapper?.['tag'] === 'ok' || wrapper?.['kind'] === 'success'
          ? wrapper['value']
          : raw,
    };
  } catch (error) {
    return { kind: 'unexpected', error: canonicalFailure(error) };
  }
};

const makeIdSource = (generatedIds: string[]): IdSource => {
  let next = 0;
  return Object.freeze({
    next: () => {
      const value =
        next++ === 0
          ? ids.workEvent
          : `79000000-0000-4000-8000-${String(next).padStart(12, '0')}`;
      generatedIds.push(value);
      return value;
    },
  });
};

const makeClock = (clockReads: string[]) =>
  Object.freeze({
    now: () => {
      clockReads.push(now.toISOString());
      return new Date(now);
    },
  });

const makeSignals = (signals: string[]): ProductionSystemSignals =>
  Object.freeze({
    planSuperseded: () => signals.push('plan_superseded'),
    runStarted: () => signals.push('run_started'),
    batchFrozen: () => signals.push('batch_frozen'),
    placementOutcome: () => signals.push('placement_outcome'),
    queueConflict: () => signals.push('queue_conflict'),
    overtimeConfirmed: () => signals.push('overtime_confirmed'),
    orderRouteOutcome: () => signals.push('order_route_outcome'),
    progressReconciled: () => signals.push('progress_reconciled'),
  });

const makeTargetTransactionObserver = (
  traces: TransactionTrace[],
): ProductionSystemUnitOfWorkObserver => {
  const observer: ProductionSystemUnitOfWorkObserver = <Operations>(
    operation: string,
    unitOfWork: {
      transaction: <Value, Failure>(
        work: (operations: Operations) => Promise<Result<Value, Failure>>,
      ) => Promise<Result<Value, Failure>>;
    },
  ) =>
    Object.freeze({
      transaction: async <Value, Failure>(
        work: (operations: Operations) => Promise<Result<Value, Failure>>,
      ): Promise<Result<Value, Failure>> => {
        let outcome: TransactionTrace['outcome'] = 'failed';
        try {
          const value = await unitOfWork.transaction(work);
          outcome = value.tag === 'ok' ? 'committed' : 'expected_rollback';
          return value;
        } finally {
          traces.push({ operation, outcome });
        }
      },
    });
  return observer;
};

const seedReceipt = async (
  db: PostgresDatabase,
  scenario: ResolveSourceClosedFulfillmentConformanceScenario,
): Promise<void> => {
  const receipt = scenario.fixture.storedReceipt;
  if (receipt === undefined) return;
  const command = scenario.commands[0]!;
  await db.insert(presslyPostgresOwnerSchemas.production.workEvents).values({
    id: ids.receiptEvent,
    locationId,
    eventType: 'production_order_resolved_without_production',
    entityType: 'production_order',
    entityId: ids.productionOrder,
    actorId: ids.actor,
    expectedVersion: 4,
    idempotencyKey: command.idempotencyKey,
    payload: {
      action: 'resolve_without_production',
      from: 'open',
      resolutionState: 'resolved_without_production',
      reason: 'order_will_not_be_produced',
      note: null,
      reviewReasons: [],
      clearedPendingPlacement: false,
      version: 5,
      _idempotency: {
        version: 1,
        command: {
          operation: 'production_order_resolved_without_production',
          locationId,
          actorId:
            receipt === 'exact'
              ? ids.actor
              : '79000000-0000-4000-8000-999999999999',
          target: {
            entityType: 'production_order',
            entityId: ids.productionOrder,
          },
          expectedVersion: 4,
          payload: {
            action: 'resolve_without_production',
            reason: 'order_will_not_be_produced',
            note: null,
            confirmReviewedFacts: false,
            sourceStatePrecondition: {
              commercialState: 'open',
              admissionState: 'unreleased',
            },
          },
        },
        result: {
          locationId,
          orderId: ids.productionOrder,
          action: 'resolve_without_production',
          resolutionState: 'resolved_without_production',
          transitionedAt: now.toISOString(),
          version: 5,
          replayed: false,
        },
      },
    },
    createdAt: initialTime,
  });
};

const seed = async (
  db: PostgresDatabase,
  scenario: ResolveSourceClosedFulfillmentConformanceScenario,
): Promise<void> => {
  await seedProductionLocationConformanceFacts(db, [
    {
      id: locationId,
      businessId: ids.business,
      name: 'Source Closed Conformance Facility',
      timezone: 'America/New_York',
      createdAt: initialTime,
      updatedAt: initialTime,
    },
  ]);
  if (scenario.fixture.includeProjection === false) return;

  const admissionState = scenario.fixture.admissionState ?? 'unreleased';
  const commercialState = scenario.fixture.commercialState ?? 'open';
  const resolutionState = scenario.fixture.resolutionState ?? 'open';
  const hasIntake = scenario.fixture.hasIntake === true;

  await db.insert(presslyPostgresOwnerSchemas.production.orderDemands).values({
    id: ids.demand,
    fulfillmentId: ids.fulfillment,
    fulfillmentVersion: 1,
    projectionHash: 'a'.repeat(64),
    admissionState,
    commercialState,
    displayReference: 'SOURCE-CLOSED-CONFORMANCE-1',
    locationId,
    revisionAt: initialTime,
    phase: 'expected',
    estimatedWeightLbs: 24,
    estimatedWeightSource: 'external_estimate',
    dueAt,
    createdAt: initialTime,
    updatedAt: initialTime,
  });
  await db
    .insert(presslyPostgresOwnerSchemas.production.productionOrders)
    .values({
      id: ids.productionOrder,
      orderDemandId: ids.demand,
      locationId,
      dueAt,
      operationalStatus: 'release_pending',
      executionStatus: 'unassigned',
      resolutionState,
      ...(resolutionState === 'resolved_without_production'
        ? {
            resolvedAt: initialTime,
            resolvedBy: ids.actor,
            resolutionReason: 'order_will_not_be_produced',
            resolutionNote: null,
          }
        : {}),
      derivedWeightLbs: 24,
      derivedWeightSource: 'external_estimate',
      bagCount: hasIntake ? 2 : null,
      bagCountSource: hasIntake ? 'operator_intake' : null,
      intakeRecordedAt: hasIntake ? initialTime : null,
      intakeVersion: hasIntake ? 1 : 0,
      version: 4,
      createdAt: initialTime,
      updatedAt: initialTime,
    });

  if (scenario.fixture.hasCurrentSelection === true) {
    await db
      .insert(presslyPostgresOwnerSchemas.production.productionShifts)
      .values({
        id: ids.shift,
        locationId,
        startsAt: initialTime,
        endsAt: new Date('2026-08-22T22:00:00.000Z'),
        timezone: 'America/New_York',
        status: 'open',
        effectiveFolderCount: 2,
        createdAt: initialTime,
        updatedAt: initialTime,
      });
    await db
      .insert(presslyPostgresOwnerSchemas.production.productionShiftSelections)
      .values({
        productionShiftId: ids.shift,
        locationId,
        version: 1,
        selectedBy: ids.actor,
        selectedAt: initialTime,
        updatedAt: initialTime,
      });
    await db
      .insert(
        presslyPostgresOwnerSchemas.production.productionShiftSelectedOrders,
      )
      .values({
        productionShiftId: ids.shift,
        locationId,
        productionOrderId: ids.productionOrder,
        selectedBy: ids.actor,
        selectedAt: initialTime,
      });
  }

  if (scenario.fixture.fault === 'invalid_admission_state')
    await db.execute(sql`
      update order_demands
      set admission_state = 'invalid'
      where id = ${ids.demand}
    `);

  await seedReceipt(db, scenario);

  if (scenario.fixture.fault === 'event_append')
    await db.insert(presslyPostgresOwnerSchemas.production.workEvents).values({
      id: ids.workEvent,
      locationId,
      eventType: 'source_close_fault_fixture',
      entityType: 'production_order',
      entityId: ids.productionOrder,
      actorId: ids.actor,
      idempotencyKey: 'source-close-event-id-collision',
      payload: {},
      createdAt: initialTime,
    });
};

const installFault = async (
  db: PostgresDatabase,
  scenario: ResolveSourceClosedFulfillmentConformanceScenario,
): Promise<() => Promise<void>> => {
  if (scenario.fixture.fault === 'late_cas') {
    await db.execute(sql`
      create function source_close_reject_order_update()
      returns trigger language plpgsql as $$
      begin
        return null;
      end;
      $$
    `);
    await db.execute(sql`
      create trigger source_close_late_cas
      before update on production_orders
      for each row execute function source_close_reject_order_update()
    `);
    return () => removeFaults(db);
  }
  if (scenario.fixture.fault === 'candidate_query') {
    await db.execute(
      sql`alter table order_demands rename to order_demands_source_close_fault`,
    );
    return () => restoreCandidateTableName(db);
  }
  return async () => undefined;
};

const normalizeDate = (value: Date | null): string | null =>
  value?.toISOString() ?? null;

const readSnapshot = async (
  db: PostgresDatabase,
  scenario: ResolveSourceClosedFulfillmentConformanceScenario,
): Promise<DurableSnapshot> => {
  const [order] = await db
    .select({
      resolutionState:
        presslyPostgresOwnerSchemas.production.productionOrders.resolutionState,
      resolvedAt:
        presslyPostgresOwnerSchemas.production.productionOrders.resolvedAt,
      resolvedBy:
        presslyPostgresOwnerSchemas.production.productionOrders.resolvedBy,
      resolutionReason:
        presslyPostgresOwnerSchemas.production.productionOrders
          .resolutionReason,
      resolutionNote:
        presslyPostgresOwnerSchemas.production.productionOrders.resolutionNote,
      operationalStatus:
        presslyPostgresOwnerSchemas.production.productionOrders
          .operationalStatus,
      executionStatus:
        presslyPostgresOwnerSchemas.production.productionOrders.executionStatus,
      pendingPlacement:
        presslyPostgresOwnerSchemas.production.productionOrders
          .pendingPlacement,
      bagCount:
        presslyPostgresOwnerSchemas.production.productionOrders.bagCount,
      intakeRecordedAt:
        presslyPostgresOwnerSchemas.production.productionOrders
          .intakeRecordedAt,
      intakeVersion:
        presslyPostgresOwnerSchemas.production.productionOrders.intakeVersion,
      version: presslyPostgresOwnerSchemas.production.productionOrders.version,
      updatedAt:
        presslyPostgresOwnerSchemas.production.productionOrders.updatedAt,
    })
    .from(presslyPostgresOwnerSchemas.production.productionOrders)
    .where(
      eq(
        presslyPostgresOwnerSchemas.production.productionOrders.id,
        ids.productionOrder,
      ),
    );
  const [demand] = await db
    .select({
      admissionState:
        presslyPostgresOwnerSchemas.production.orderDemands.admissionState,
      commercialState:
        presslyPostgresOwnerSchemas.production.orderDemands.commercialState,
      phase: presslyPostgresOwnerSchemas.production.orderDemands.phase,
      fulfillmentVersion:
        presslyPostgresOwnerSchemas.production.orderDemands.fulfillmentVersion,
      updatedAt: presslyPostgresOwnerSchemas.production.orderDemands.updatedAt,
    })
    .from(presslyPostgresOwnerSchemas.production.orderDemands)
    .where(
      eq(presslyPostgresOwnerSchemas.production.orderDemands.id, ids.demand),
    );
  const events = await db
    .select({
      id: presslyPostgresOwnerSchemas.production.workEvents.id,
      eventType: presslyPostgresOwnerSchemas.production.workEvents.eventType,
      entityType: presslyPostgresOwnerSchemas.production.workEvents.entityType,
      entityId: presslyPostgresOwnerSchemas.production.workEvents.entityId,
      actorId: presslyPostgresOwnerSchemas.production.workEvents.actorId,
      expectedVersion:
        presslyPostgresOwnerSchemas.production.workEvents.expectedVersion,
      idempotencyKey:
        presslyPostgresOwnerSchemas.production.workEvents.idempotencyKey,
      payload: presslyPostgresOwnerSchemas.production.workEvents.payload,
    })
    .from(presslyPostgresOwnerSchemas.production.workEvents)
    .orderBy(asc(presslyPostgresOwnerSchemas.production.workEvents.id));
  const [location] = await db
    .select({
      liveRevision:
        presslyPostgresOwnerSchemas.production.productionLocations.liveRevision,
    })
    .from(presslyPostgresOwnerSchemas.production.productionLocations)
    .where(
      eq(
        presslyPostgresOwnerSchemas.production.productionLocations.id,
        locationId,
      ),
    );
  return Object.freeze({
    order:
      order === undefined
        ? null
        : {
            ...order,
            resolvedAt: normalizeDate(order.resolvedAt),
            intakeRecordedAt: normalizeDate(order.intakeRecordedAt),
            updatedAt: order.updatedAt.toISOString(),
          },
    demand:
      demand === undefined
        ? null
        : { ...demand, updatedAt: demand.updatedAt.toISOString() },
    events: events.map((event) => ({
      ...event,
      idempotencyKey:
        scenario.normalizeWinningIdempotencyKey === true &&
        scenario.commands.some(
          (command) => command.idempotencyKey === event.idempotencyKey,
        )
          ? '<winning-command>'
          : event.idempotencyKey,
    })),
    liveRevision: location?.liveRevision ?? -1,
  });
};

const nestedCommands = (snapshot: DurableSnapshot): readonly unknown[] =>
  snapshot.events.flatMap((rawEvent) => {
    const event = record(rawEvent);
    const payload = record(event?.['payload']);
    const envelope = record(payload?.['_idempotency']);
    return envelope?.['command'] === undefined ? [] : [envelope['command']];
  });

const sortOutcomes = (
  outcomes: readonly CanonicalOutcome[],
): readonly CanonicalOutcome[] =>
  [...outcomes].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );

const sortTransactions = (
  transactions: readonly TransactionTrace[],
): readonly TransactionTrace[] =>
  [...transactions].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );

const waitForBlockedCommands = async (): Promise<void> => {
  await new Promise<void>((resolveWait) => setTimeout(resolveWait, 100));
};

const runCommands = async (input: {
  db: PostgresDatabase;
  execute: (command: ResolveSourceClosedFulfillmentCommand) => Promise<unknown>;
  scenario: ResolveSourceClosedFulfillmentConformanceScenario;
}): Promise<readonly CanonicalOutcome[]> => {
  const invoke = (command: ResolveSourceClosedFulfillmentCommand) =>
    captureOutcome(input.execute, command);
  let outcomes: readonly CanonicalOutcome[];
  if (input.scenario.execution === 'sequential') {
    const collected: CanonicalOutcome[] = [];
    for (const command of input.scenario.commands)
      collected.push(await invoke(command));
    outcomes = collected;
  } else if (input.scenario.execution === 'after_lock_concurrent') {
    let running: Promise<readonly CanonicalOutcome[]> | undefined;
    await input.db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext('production-scheduling'), hashtext(${locationId}))`,
      );
      running = Promise.all(input.scenario.commands.map(invoke));
      await waitForBlockedCommands();
    });
    outcomes = await (running ?? Promise.resolve([]));
  } else {
    outcomes = await Promise.all(input.scenario.commands.map(invoke));
  }
  return input.scenario.normalizeOutcomeOrder === true
    ? sortOutcomes(outcomes)
    : outcomes;
};

const observe = async (
  database: ConformanceDatabase,
  scenario: ResolveSourceClosedFulfillmentConformanceScenario,
): Promise<ConformanceObservation> => {
  await removeFaults(database.db);
  await database.reset();
  await seed(database.db, scenario);
  const before = await readSnapshot(database.db, scenario);
  const generatedIds: string[] = [];
  const clockReads: string[] = [];
  const transactions: TransactionTrace[] = [];
  const signals: string[] = [];
  const idSource = makeIdSource(generatedIds);
  const clock = makeClock(clockReads);
  const signalSink = makeSignals(signals);
  const execute = makeProductionSystem({
    ...productionCommandSystemDependencies(),
    db: database.db,
    ids: idSource,
    clock,
    signals: signalSink,
    observeCellUnitOfWork: makeTargetTransactionObserver(transactions),
  }).cells.resolveSourceClosedFulfillment.execute;
  const cleanupFault = await installFault(database.db, scenario);
  let outcomes: readonly CanonicalOutcome[];
  try {
    outcomes = await runCommands({ db: database.db, execute, scenario });
  } finally {
    await cleanupFault();
  }
  const after = await readSnapshot(database.db, scenario);
  return Object.freeze({
    outcomes,
    state: { before, after },
    generatedIds,
    clockReads,
    transactions: sortTransactions(transactions),
    signals,
    nestedCommands: nestedCommands(after),
  });
};

const outcomeValues = (
  observation: ConformanceObservation,
): readonly Readonly<Record<string, unknown>>[] =>
  observation.outcomes.flatMap((outcome) =>
    outcome.kind === 'success' && record(outcome.value) !== null
      ? [record(outcome.value)!]
      : [],
  );

const failureCodes = (observation: ConformanceObservation): readonly string[] =>
  observation.outcomes.flatMap((outcome) =>
    outcome.kind === 'failure'
      ? [outcome.failure.code]
      : outcome.kind === 'unexpected'
        ? [outcome.error.code]
        : [],
  );

const expectNoStateMutation = (observation: ConformanceObservation): void => {
  expect(observation.state.after).toEqual(observation.state.before);
};

describe('production.resolve-source-closed-fulfillment.v1 public conformance', () => {
  it.each(resolveSourceClosedFulfillmentConformanceScenarios)(
    '$name',
    async (scenario) => {
      const target = await observe(database, scenario);
      expect(target.signals).toEqual([]);

      if (scenario.name.startsWith('untouched unreleased')) {
        expect(target.outcomes).toEqual([
          {
            kind: 'success',
            value: {
              outcome: 'resolved',
              locationId,
              fulfillmentId: ids.fulfillment,
              productionOrderId: ids.productionOrder,
              version: 5,
              replayed: false,
            },
          },
        ]);
        expect(target.state).toMatchObject({
          before: {
            order: { resolutionState: 'open', version: 4 },
            liveRevision: 0,
          },
          after: {
            order: {
              resolutionState: 'resolved_without_production',
              resolvedAt: now.toISOString(),
              resolvedBy: ids.actor,
              resolutionReason: 'order_will_not_be_produced',
              resolutionNote: null,
              version: 5,
              updatedAt: now.toISOString(),
            },
            liveRevision: 1,
          },
        });
        expect(target.clockReads).toEqual([now.toISOString()]);
        expect(target.generatedIds).toEqual([ids.workEvent]);
        expect(target.transactions).toEqual([
          {
            operation: 'production.change_order_resolution',
            outcome: 'committed',
          },
        ]);
        expect(target.nestedCommands).toEqual([
          {
            operation: 'production_order_resolved_without_production',
            locationId,
            actorId: ids.actor,
            target: {
              entityType: 'production_order',
              entityId: ids.productionOrder,
            },
            expectedVersion: 4,
            payload: {
              action: 'resolve_without_production',
              reason: 'order_will_not_be_produced',
              note: null,
              confirmReviewedFacts: false,
              sourceStatePrecondition: {
                commercialState: 'open',
                admissionState: 'unreleased',
              },
            },
          },
        ]);
        return;
      }

      if (scenario.name.startsWith('recorded intake')) {
        expect(outcomeValues(target)).toMatchObject([
          {
            outcome: 'review_required',
            reason: 'operational_review_required',
          },
        ]);
        expectNoStateMutation(target);
        expect(target.clockReads).toEqual([]);
        expect(target.generatedIds).toEqual([]);
        expect(target.transactions).toEqual([
          {
            operation: 'production.change_order_resolution',
            outcome: 'expected_rollback',
          },
        ]);
        return;
      }

      if (scenario.name.startsWith('shift participation')) {
        expect(outcomeValues(target)).toMatchObject([
          {
            outcome: 'review_required',
            reason: 'operational_participation',
          },
        ]);
        expectNoStateMutation(target);
        expect(target.transactions).toMatchObject([
          { outcome: 'expected_rollback' },
        ]);
        return;
      }

      if (scenario.name.startsWith('an exact durable')) {
        expect(outcomeValues(target)).toMatchObject([
          { outcome: 'resolved', version: 5, replayed: true },
        ]);
        expectNoStateMutation(target);
        expect(target.clockReads).toEqual([]);
        expect(target.generatedIds).toEqual([]);
        expect(target.transactions).toMatchObject([{ outcome: 'committed' }]);
        return;
      }

      if (scenario.name.startsWith('resolved work is retained')) {
        expect(outcomeValues(target)).toEqual([
          {
            outcome: 'already_resolved',
            locationId,
            fulfillmentId: ids.fulfillment,
            productionOrderId: ids.productionOrder,
            version: 4,
          },
        ]);
        expectNoStateMutation(target);
        expect(target.clockReads).toEqual([]);
        expect(target.generatedIds).toEqual([]);
        expect(target.transactions).toEqual([
          {
            operation: 'production.change_order_resolution',
            outcome: 'expected_rollback',
          },
        ]);
        return;
      }

      if (scenario.name.startsWith('divergent durable')) {
        expect(outcomeValues(target)).toMatchObject([
          { outcome: 'review_required', reason: 'concurrent_change' },
        ]);
        expectNoStateMutation(target);
        expect(target.transactions).toMatchObject([
          { outcome: 'expected_rollback' },
        ]);
        return;
      }

      if (scenario.name.startsWith('same-key concurrency')) {
        expect(
          outcomeValues(target)
            .map((value) => value['replayed'])
            .sort(),
        ).toEqual([false, true]);
        expect(target.state.after.events).toHaveLength(1);
        expect(target.clockReads).toEqual([now.toISOString()]);
        expect(target.generatedIds).toEqual([ids.workEvent]);
        expect(target.transactions).toEqual([
          {
            operation: 'production.change_order_resolution',
            outcome: 'committed',
          },
          {
            operation: 'production.change_order_resolution',
            outcome: 'committed',
          },
        ]);
        return;
      }

      if (scenario.name.startsWith('distinct-key')) {
        expect(outcomeValues(target)).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ outcome: 'resolved' }),
            expect.objectContaining({
              outcome: 'review_required',
              reason: 'concurrent_change',
            }),
          ]),
        );
        expect(target.state.after.events).toHaveLength(1);
        expect(target.clockReads).toEqual([now.toISOString()]);
        expect(target.generatedIds).toEqual([ids.workEvent]);
        expect(target.transactions).toEqual([
          {
            operation: 'production.change_order_resolution',
            outcome: 'committed',
          },
          {
            operation: 'production.change_order_resolution',
            outcome: 'expected_rollback',
          },
        ]);
        return;
      }

      if (scenario.name.startsWith('a real late')) {
        expect(outcomeValues(target)).toMatchObject([
          { outcome: 'review_required', reason: 'concurrent_change' },
        ]);
        expectNoStateMutation(target);
        expect(target.clockReads).toEqual([now.toISOString()]);
        expect(target.generatedIds).toEqual([]);
        expect(target.transactions).toMatchObject([
          { outcome: 'expected_rollback' },
        ]);
        return;
      }

      if (scenario.name.startsWith('work-event append')) {
        expect(failureCodes(target)).toEqual([
          'production_order_resolution_change_failed',
        ]);
        expectNoStateMutation(target);
        expect(target.clockReads).toEqual([now.toISOString()]);
        expect(target.generatedIds).toEqual([ids.workEvent]);
        expect(target.transactions).toMatchObject([{ outcome: 'failed' }]);
        return;
      }

      if (scenario.name.startsWith('candidate query')) {
        expect(failureCodes(target)).toEqual([
          'production_source_closed_resolution_failed',
        ]);
        expectNoStateMutation(target);
        expect(target.clockReads).toEqual([]);
        expect(target.generatedIds).toEqual([]);
        expect(target.transactions).toEqual([]);
        return;
      }

      if (scenario.name.startsWith('owned candidate-state')) {
        expect(failureCodes(target)).toEqual([
          'source_closed_fulfillment_candidate_invalid',
        ]);
        expectNoStateMutation(target);
        expect(target.transactions).toEqual([]);
        return;
      }

      expectNoStateMutation(target);
      expect(target.clockReads).toEqual([]);
      expect(target.generatedIds).toEqual([]);
      expect(target.transactions).toEqual([]);
    },
  );
});
