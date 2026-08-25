import {
  makeProductionActorReadV1Capability,
  makeProductionScopeReconciliationV1Capability,
} from '@pressly/access-system/assembly/production-capabilities';
import {
  createPostgresRuntime,
  type PostgresDatabase,
  type PostgresTransaction,
} from '@pressly/postgres/client';
import { asc, eq, sql } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import type { IdSource } from '@pressly/cells/id-source';
import {
  makeProductionSystem,
  type ProductionSystemSignals,
  type ProductionSystemUnitOfWorkObserver,
} from '@pressly/production-system/testing/assembly';
import type { ApplyFulfillmentDemandCommand } from '@pressly/production-system/operations/demand/apply-fulfillment-demand/types';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { makeSequenceIdSource } from '@pressly/testkit/id-source';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyFulfillmentDemandConformanceDueAt as dueAt,
  applyFulfillmentDemandConformanceIds as ids,
  applyFulfillmentDemandConformanceLocationId as locationId,
  applyFulfillmentDemandConformanceNow as now,
  applyFulfillmentDemandConformanceObservedAt as observedAt,
  applyFulfillmentDemandConformanceOtherLocationId as otherLocationId,
  applyFulfillmentDemandConformanceScenarios,
  applyFulfillmentDemandInvalidStoredReplayCommand,
  applyFulfillmentDemandMalformedEnvelopeCommand,
  applyFulfillmentDemandMalformedResultCommand,
  type ApplyFulfillmentDemandConformanceExpectedOutcome,
  type ApplyFulfillmentDemandConformanceFixture,
  type ApplyFulfillmentDemandConformanceMutation,
  type ApplyFulfillmentDemandConformanceScenario,
} from '../src/public.ts';
import { seedProductionLocationConformanceFacts } from '../src/production-location-conformance.postgres.ts';

const dedicatedDatabaseUrl =
  'postgres://pressly:pressly@localhost:55434/pressly_apply_fulfillment_demand_conformance_test';
const databaseUrl = getTestDatabaseUrl(
  'PRESSLY_APPLY_FULFILLMENT_DEMAND_CONFORMANCE_DATABASE_URL',
  dedicatedDatabaseUrl,
);
const resetDatabaseUrl = getTestDatabaseUrl(
  'PRESSLY_APPLY_FULFILLMENT_DEMAND_CONFORMANCE_DATABASE_RESET_URL',
  databaseUrl,
);

const database = createTestDatabaseRuntime({
  databaseUrl,
  resetDatabaseUrl,
  tableNames: [
    'production_order_stage_attempts',
    'stage_machine_assignments',
    'stage_runs',
    'production_batch_orders',
    'production_batches',
    'production_runs',
    'work_events',
    'production_shift_selected_orders',
    'production_shift_selections',
    'schedule_runs',
    'scheduler_configs',
    'production_bags',
    'production_orders',
    'order_demands',
    'production_shifts',
    'production_locations',
    'business_accounts',
  ],
  maxConnections: 12,
});

const faultDatabase = createPostgresRuntime({
  schema: presslyPostgresOwnerSchemas.production,
  databaseUrl: resetDatabaseUrl,
  maxConnections: 2,
});

type CanonicalFailure = Readonly<{
  kind: string;
  classification: string | null;
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
  operation: 'production.apply_fulfillment_demand';
  outcome: 'committed' | 'expected_rollback' | 'failed';
}>;

type VariantObservation = Readonly<{
  outcomes: readonly CanonicalOutcome[];
  before: unknown;
  after: unknown;
  usedIds: readonly string[];
  clockReads: number;
  signals: readonly string[];
  transactions: readonly TransactionTrace[];
}>;

const removeFaults = async (): Promise<void> => {
  await faultDatabase.db.execute(sql`
    drop trigger if exists apply_demand_conformance_suppress_update
    on order_demands
  `);
  await faultDatabase.db.execute(sql`
    drop trigger if exists apply_demand_conformance_order_cas
    on production_orders
  `);
  await faultDatabase.db.execute(sql`
    drop trigger if exists apply_demand_conformance_receipt_collision
    on work_events
  `);
  await faultDatabase.db.execute(sql`
    drop function if exists apply_demand_conformance_return_null()
  `);
  await faultDatabase.db.execute(sql`
    drop function if exists apply_demand_conformance_insert_receipt()
  `);
};

beforeAll(async () => {
  await database.check();
  await faultDatabase.check();
});

afterAll(async () => {
  await removeFaults();
  await faultDatabase.close();
  await database.close();
});

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
    classification:
      typeof fields?.['classification'] === 'string'
        ? fields['classification']
        : null,
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
  execute: (command: ApplyFulfillmentDemandCommand) => Promise<unknown>,
  command: ApplyFulfillmentDemandCommand,
): Promise<CanonicalOutcome> => {
  try {
    const raw = await execute(command);
    const carrier = record(raw);
    if (carrier?.['tag'] === 'err')
      return Object.freeze({
        kind: 'failure',
        failure: canonicalFailure(carrier['error']),
      });
    if (carrier?.['kind'] === 'failure')
      return Object.freeze({
        kind: 'failure',
        failure: canonicalFailure(carrier['failure']),
      });
    return Object.freeze({
      kind: 'success',
      value:
        carrier?.['tag'] === 'ok' || carrier?.['kind'] === 'success'
          ? carrier['value']
          : raw,
    });
  } catch (error) {
    return Object.freeze({
      kind: 'unexpected',
      error: canonicalFailure(error),
    });
  }
};

const sequenceIds = (values: readonly string[]) => {
  const sequence = makeSequenceIdSource(values);
  const used: string[] = [];
  const source: IdSource = Object.freeze({
    next: () => {
      const value = sequence.next();
      used.push(value);
      return value;
    },
  });
  return { source, used };
};

const commandIdentity = (
  command: ApplyFulfillmentDemandCommand,
): Readonly<Record<string, unknown>> => ({
  operation: 'fulfillment_demand_applied',
  locationId: command.locationId,
  actorId: '00000000-0000-4000-8000-000000000000',
  target: { entityType: 'order_demand', entityId: null },
  expectedVersion: null,
  payload: {
    fulfillmentId: command.fulfillmentId,
    fulfillmentVersion: command.fulfillmentVersion,
    projectionHash: command.projectionHash,
    displayReference: command.displayReference,
    admissionState: command.admissionState,
    commercialState: command.commercialState,
    dueAt: command.dueAt,
    observedAt: command.observedAt,
    estimatedWeightLbs: command.estimatedWeightLbs,
    estimatedWeightSource: command.estimatedWeightSource,
  },
});

const seedLocation = async (input: {
  id: string;
  active?: boolean;
}): Promise<void> => {
  await database.db
    .insert(presslyPostgresOwnerSchemas.access.accessProductionLocations)
    .values({
      id: input.id,
      businessId: ids.business,
      name: input.id,
      timezone: 'America/New_York',
      isActive: input.active ?? true,
      createdAt: now,
      updatedAt: now,
    });
};

const seedDemand = async (input: {
  version: number;
  projectionHash: string;
  admissionState: 'released' | 'unreleased' | 'withdrawn';
  commercialState?: 'open' | 'completed' | 'canceled';
  estimatedWeightLbs: number | null;
  estimatedWeightSource: 'external_estimate' | null;
}): Promise<void> => {
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.orderDemands)
    .values({
      id: ids.demand,
      fulfillmentId: ids.fulfillment,
      fulfillmentVersion: input.version,
      projectionHash: input.projectionHash,
      admissionState: input.admissionState,
      commercialState: input.commercialState ?? 'open',
      displayReference: 'ORDER-740',
      locationId,
      revisionAt: new Date(observedAt),
      phase:
        input.admissionState === 'released'
          ? 'production_released'
          : input.admissionState === 'withdrawn'
            ? 'withdrawn'
            : 'expected',
      estimatedWeightLbs: input.estimatedWeightLbs,
      estimatedWeightSource: input.estimatedWeightSource,
      dueAt: new Date(dueAt),
      createdAt: now,
      updatedAt: now,
    });
};

type SeedOrderInput = Readonly<{
  operationalStatus:
    | 'eligible'
    | 'finished'
    | 'ineligible'
    | 'intake_pending'
    | 'release_pending'
    | 'scheduled';
  executionStatus: 'finished' | 'scheduled' | 'unassigned';
  resolutionState?: 'open' | 'resolved_without_production';
  admissionOverride?: 'released' | null;
  bagCount?: number | null;
  version?: number;
}>;

const seedProductionOrder = async (input: SeedOrderInput): Promise<void> => {
  const resolutionState = input.resolutionState ?? 'open';
  const admissionOverride = input.admissionOverride ?? null;
  const bagCount = input.bagCount ?? null;
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionOrders)
    .values({
      id: ids.productionOrder,
      orderDemandId: ids.demand,
      locationId,
      dueAt: new Date(dueAt),
      priority: false,
      operationalStatus: input.operationalStatus,
      executionStatus: input.executionStatus,
      resolutionState,
      ...(resolutionState === 'resolved_without_production'
        ? {
            resolvedAt: now,
            resolvedBy: ids.actor,
            resolutionReason: 'other',
            resolutionNote: 'Conformance fixture resolution.',
          }
        : {}),
      derivedWeightLbs: 24,
      derivedWeightSource: 'external_estimate',
      bagCount,
      bagCountSource: bagCount === null ? null : 'operator_intake',
      intakeRecordedAt: bagCount === null ? null : now,
      intakeVersion: bagCount === null ? 0 : 1,
      admissionOverride,
      admissionOverrideAt: admissionOverride === null ? null : now,
      admissionOverrideBy: admissionOverride === null ? null : ids.actor,
      mustStayTogether: true,
      version: input.version ?? 1,
      eligibleAt: input.operationalStatus === 'eligible' ? now : null,
      finishedAt: input.operationalStatus === 'finished' ? now : null,
      createdAt: now,
      updatedAt: now,
    });

  if (bagCount !== null && bagCount > 0)
    await database.db
      .insert(presslyPostgresOwnerSchemas.production.bags)
      .values(
        [ids.bagOne, ids.bagTwo].slice(0, bagCount).map((id, bagIndex) => ({
          id,
          productionOrderId: ids.productionOrder,
          bagIndex,
          status: input.operationalStatus,
        })),
      );
};

const seedReplay = async (
  command: ApplyFulfillmentDemandCommand,
  input:
    | Readonly<{ kind: 'malformed_envelope' }>
    | Readonly<{ kind: 'result'; result: unknown }>,
): Promise<void> => {
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.workEvents)
    .values({
      id: ids.replayEvent,
      locationId,
      eventType: 'fulfillment_demand_applied',
      entityType: 'order_demand',
      entityId: ids.demand,
      actorId: '00000000-0000-4000-8000-000000000000',
      expectedVersion: null,
      idempotencyKey: command.idempotencyKey,
      payload:
        input.kind === 'malformed_envelope'
          ? { _idempotency: { version: 1, command: [], result: null } }
          : {
              outcome: 'fixture',
              _idempotency: {
                version: 1,
                command: commandIdentity(command),
                result: input.result,
              },
            },
      createdAt: now,
    });
};

const seed = async (
  fixture: ApplyFulfillmentDemandConformanceFixture,
): Promise<void> => {
  await database.db
    .insert(presslyPostgresOwnerSchemas.access.businessAccounts)
    .values({
      id: ids.business,
      slug: 'apply-fulfillment-demand-conformance',
      displayName: 'Apply Fulfillment Demand Conformance',
      createdAt: now,
      updatedAt: now,
    });
  await seedLocation({
    id: locationId,
    active: fixture !== 'inactive_location',
  });
  await seedLocation({ id: otherLocationId });
  await seedProductionLocationConformanceFacts(database.db, [
    {
      id: locationId,
      businessId: ids.business,
      name: locationId,
      timezone: 'America/New_York',
      isActive: fixture !== 'inactive_location',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: otherLocationId,
      businessId: ids.business,
      name: otherLocationId,
      timezone: 'America/New_York',
      createdAt: now,
      updatedAt: now,
    },
  ]);

  if (fixture === 'unweighted')
    await seedDemand({
      version: 1,
      projectionHash: 'a'.repeat(64),
      admissionState: 'unreleased',
      estimatedWeightLbs: null,
      estimatedWeightSource: null,
    });

  if (
    fixture === 'weighted' ||
    fixture === 'weighted_v2' ||
    fixture === 'intake_override' ||
    fixture === 'resolved' ||
    fixture === 'scheduled' ||
    fixture === 'finished'
  ) {
    const version = fixture === 'weighted_v2' ? 2 : 1;
    const admissionState =
      fixture === 'intake_override' ? 'unreleased' : 'released';
    await seedDemand({
      version,
      projectionHash: version === 2 ? 'b'.repeat(64) : 'a'.repeat(64),
      admissionState,
      estimatedWeightLbs: 24,
      estimatedWeightSource: 'external_estimate',
    });
    await seedProductionOrder(
      fixture === 'intake_override'
        ? {
            operationalStatus: 'eligible',
            executionStatus: 'unassigned',
            admissionOverride: 'released',
            bagCount: 2,
            version: 2,
          }
        : fixture === 'resolved'
          ? {
              operationalStatus: 'release_pending',
              executionStatus: 'unassigned',
              resolutionState: 'resolved_without_production',
              version: 2,
            }
          : fixture === 'scheduled'
            ? {
                operationalStatus: 'scheduled',
                executionStatus: 'scheduled',
                bagCount: 2,
                version: 4,
              }
            : fixture === 'finished'
              ? {
                  operationalStatus: 'finished',
                  executionStatus: 'finished',
                  bagCount: 2,
                  version: 5,
                }
              : {
                  operationalStatus: 'intake_pending',
                  executionStatus: 'unassigned',
                },
    );
  }

  if (fixture === 'stored_invalid_replay')
    await seedReplay(applyFulfillmentDemandInvalidStoredReplayCommand, {
      kind: 'result',
      result: {
        orderDemandId: ids.demand,
        productionOrderId: null,
        outcome: 'unchanged',
        replayed: false,
      },
    });
  if (fixture === 'stored_malformed_result')
    await seedReplay(applyFulfillmentDemandMalformedResultCommand, {
      kind: 'result',
      result: { retainedMalformedResult: true },
    });
  if (fixture === 'stored_malformed_envelope')
    await seedReplay(applyFulfillmentDemandMalformedEnvelopeCommand, {
      kind: 'malformed_envelope',
    });
};

const readState = async (db: PostgresDatabase): Promise<unknown> => {
  const [demands, productionOrders, bags, events, locations] =
    await Promise.all([
      db
        .select()
        .from(presslyPostgresOwnerSchemas.production.orderDemands)
        .orderBy(asc(presslyPostgresOwnerSchemas.production.orderDemands.id)),
      db
        .select()
        .from(presslyPostgresOwnerSchemas.production.productionOrders)
        .orderBy(
          asc(presslyPostgresOwnerSchemas.production.productionOrders.id),
        ),
      db
        .select()
        .from(presslyPostgresOwnerSchemas.production.bags)
        .orderBy(asc(presslyPostgresOwnerSchemas.production.bags.id)),
      db
        .select()
        .from(presslyPostgresOwnerSchemas.production.workEvents)
        .orderBy(
          asc(presslyPostgresOwnerSchemas.production.workEvents.createdAt),
          asc(presslyPostgresOwnerSchemas.production.workEvents.id),
        ),
      db
        .select()
        .from(presslyPostgresOwnerSchemas.production.productionLocations)
        .orderBy(
          asc(presslyPostgresOwnerSchemas.production.productionLocations.id),
        ),
    ]);
  return Object.freeze({
    demands,
    productionOrders,
    bags,
    events,
    locations,
  });
};

const seedEventIdCollision = async (): Promise<void> => {
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.workEvents)
    .values({
      id: ids.collisionEvent,
      locationId,
      eventType: 'fixture',
      entityType: 'fixture',
      entityId: ids.collisionEvent,
      actorId: '00000000-0000-4000-8000-000000000000',
      expectedVersion: null,
      idempotencyKey: 'apply-demand-conformance-existing-event',
      payload: {},
      createdAt: now,
    });
};

const installReturnNullTrigger = async (
  table: 'order_demands' | 'production_orders',
): Promise<void> => {
  await faultDatabase.db.execute(sql`
    create function apply_demand_conformance_return_null()
    returns trigger language plpgsql as $$
    begin
      return null;
    end;
    $$
  `);
  if (table === 'order_demands')
    await faultDatabase.db.execute(sql`
      create trigger apply_demand_conformance_suppress_update
      before update on order_demands
      for each row execute function apply_demand_conformance_return_null()
    `);
  else
    await faultDatabase.db.execute(sql`
      create trigger apply_demand_conformance_order_cas
      before update on production_orders
      for each row execute function apply_demand_conformance_return_null()
    `);
};

const installReceiptCollision = async (): Promise<void> => {
  await faultDatabase.db.execute(sql`
    create function apply_demand_conformance_insert_receipt()
    returns trigger language plpgsql as $$
    begin
      if pg_trigger_depth() = 1 then
        insert into work_events (
          id,
          location_id,
          event_type,
          entity_type,
          entity_id,
          actor_id,
          expected_version,
          idempotency_key,
          payload_json
        ) values (
          '74000000-0000-4000-8000-000000000099'::uuid,
          new.location_id,
          'fixture',
          'order_demand',
          new.entity_id,
          '00000000-0000-4000-8000-000000000000'::uuid,
          null,
          new.idempotency_key,
          '{}'::jsonb
        );
      end if;
      return new;
    end;
    $$
  `);
  await faultDatabase.db.execute(sql`
    create trigger apply_demand_conformance_receipt_collision
    before insert on work_events
    for each row execute function apply_demand_conformance_insert_receipt()
  `);
};

const applyMutation = async (
  mutation: ApplyFulfillmentDemandConformanceMutation,
): Promise<void> => {
  switch (mutation) {
    case 'none':
      return;
    case 'event_id_collision':
      return seedEventIdCollision();
    case 'suppress_demand_update':
      return installReturnNullTrigger('order_demands');
    case 'order_cas_miss':
      return installReturnNullTrigger('production_orders');
    case 'receipt_collision':
      return installReceiptCollision();
  }
};

const productionSignals = (signals: string[]): ProductionSystemSignals => {
  const recordSignal = (name: string) => () => signals.push(name);
  return Object.freeze({
    planSuperseded: recordSignal('plan-superseded'),
    batchFrozen: recordSignal('batch-frozen'),
    queueConflict: recordSignal('queue-conflict'),
    orderRouteOutcome: recordSignal('order-route-outcome'),
    progressReconciled: recordSignal('progress-reconciled'),
  });
};

const transactionObserver =
  (transactions: TransactionTrace[]): ProductionSystemUnitOfWorkObserver =>
  (operation, unitOfWork) => ({
    transaction: async (work) => {
      let outcome: TransactionTrace['outcome'] = 'failed';
      try {
        const value = await unitOfWork.transaction(work);
        outcome = value.tag === 'err' ? 'expected_rollback' : 'committed';
        return value;
      } finally {
        if (operation === 'production.apply_fulfillment_demand')
          transactions.push({ operation, outcome });
      }
    },
  });

const makeExecutor = (input: {
  ids: IdSource;
  clock: Readonly<{ now: () => Date }>;
  signals: string[];
  transactions: TransactionTrace[];
}): ((command: ApplyFulfillmentDemandCommand) => Promise<unknown>) =>
  makeProductionSystem({
    schema: presslyPostgresOwnerSchemas.production,
    productionActorReadV1: makeProductionActorReadV1Capability(
      database.db,
      presslyPostgresOwnerSchemas.access,
    ),
    productionScopeReconciliationV1:
      makeProductionScopeReconciliationV1Capability(
        database.db,
        presslyPostgresOwnerSchemas.access,
      ),
    db: database.db,
    ids: input.ids,
    clock: input.clock,
    signals: productionSignals(input.signals),
    observeCellUnitOfWork: transactionObserver(input.transactions),
  }).cells.applyFulfillmentDemand.execute;

const observeVariant = async (
  scenario: ApplyFulfillmentDemandConformanceScenario,
): Promise<VariantObservation> => {
  await removeFaults();
  await database.reset();
  await seed(scenario.fixture);
  await applyMutation(scenario.mutation);
  const before = await readState(database.db);
  const idSequence = sequenceIds(scenario.generatedIds);
  const signals: string[] = [];
  const transactions: TransactionTrace[] = [];
  let clockReads = 0;
  const execute = makeExecutor({
    ids: idSequence.source,
    clock: {
      now: () => {
        clockReads += 1;
        return now;
      },
    },
    signals,
    transactions,
  });

  try {
    const outcomes =
      scenario.execution === 'concurrent'
        ? await Promise.all(
            scenario.commands.map((command) =>
              captureOutcome(execute, command),
            ),
          )
        : await scenario.commands.reduce<Promise<CanonicalOutcome[]>>(
            async (pending, command) => [
              ...(await pending),
              await captureOutcome(execute, command),
            ],
            Promise.resolve([]),
          );
    const after = await readState(database.db);
    return Object.freeze({
      outcomes,
      before,
      after,
      usedIds: idSequence.used,
      clockReads,
      signals,
      transactions,
    });
  } finally {
    await removeFaults();
  }
};

const canonicalize = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
};

const replaceStrings = (
  value: unknown,
  replacements: ReadonlyMap<string, string>,
): unknown => {
  if (typeof value === 'string') return replacements.get(value) ?? value;
  if (Array.isArray(value))
    return value.map((entry) => replaceStrings(entry, replacements));
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      replaceStrings(entry, replacements),
    ]),
  );
};

const sorted = <Value>(values: readonly Value[]): readonly Value[] =>
  values
    .slice()
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );

const normalizeState = (
  value: unknown,
  scenario: ApplyFulfillmentDemandConformanceScenario,
): unknown => {
  const fields = record(canonicalize(value));
  const events = Array.isArray(fields?.['events'])
    ? fields['events'].map((event) => {
        const eventFields = record(event);
        return eventFields === null
          ? event
          : { ...eventFields, createdAt: '<database-created-at>' };
      })
    : fields?.['events'];
  let normalized: unknown = fields === null ? value : { ...fields, events };
  if (scenario.normalizeWinner === true)
    normalized = replaceStrings(
      normalized,
      new Map([
        ['a'.repeat(64), '<winning-projection-hash>'],
        ['b'.repeat(64), '<winning-projection-hash>'],
        ['ORDER-740', '<winning-display-reference>'],
        ['ORDER-RACE-B', '<winning-display-reference>'],
        ['apply-demand-conformance-race-a', '<winning-idempotency-key>'],
        ['apply-demand-conformance-race-b', '<winning-idempotency-key>'],
      ]),
    );
  return canonicalize(normalized);
};

const outcomeSummary = (
  outcome: CanonicalOutcome,
): ApplyFulfillmentDemandConformanceExpectedOutcome => {
  if (outcome.kind === 'failure')
    return { kind: 'failure', code: outcome.failure.code };
  if (outcome.kind === 'unexpected')
    return { kind: 'unexpected', code: outcome.error.code };
  const value = record(outcome.value);
  const storedOutcome = value?.['outcome'];
  const replayed = value?.['replayed'];
  return (storedOutcome === 'applied' ||
    storedOutcome === 'ignored_older' ||
    storedOutcome === 'unchanged') &&
    typeof replayed === 'boolean'
    ? { kind: 'success', outcome: storedOutcome, replayed }
    : { kind: 'success', value: canonicalize(outcome.value) };
};

const expectedTransactions = (
  outcomes: readonly CanonicalOutcome[],
): readonly TransactionTrace[] =>
  outcomes.map((outcome) => ({
    operation: 'production.apply_fulfillment_demand',
    outcome:
      outcome.kind === 'unexpected'
        ? 'failed'
        : outcome.kind === 'success'
          ? 'committed'
          : 'expected_rollback',
  }));

const stateArray = (state: unknown, field: string): readonly unknown[] => {
  const value = record(state)?.[field];
  return Array.isArray(value) ? value : [];
};

const liveRevisionTotal = (state: unknown): number =>
  stateArray(state, 'locations').reduce<number>((total, location) => {
    const revision = record(location)?.['liveRevision'];
    return total + (typeof revision === 'number' ? revision : 0);
  }, 0);

const assertScenarioDetails = (
  scenario: ApplyFulfillmentDemandConformanceScenario,
  observation: VariantObservation,
): void => {
  const beforeOrders = stateArray(observation.before, 'productionOrders');
  const afterOrders = stateArray(observation.after, 'productionOrders');
  const afterDemands = stateArray(observation.after, 'demands');
  const afterEvents = stateArray(observation.after, 'events');

  if (scenario.name.startsWith('weighted create replays')) {
    expect(afterDemands).toEqual([
      expect.objectContaining({
        id: ids.demand,
        fulfillmentId: ids.fulfillment,
        fulfillmentVersion: 1,
        projectionHash: 'a'.repeat(64),
        displayReference: 'ORDER-740',
        admissionState: 'released',
        commercialState: 'open',
        phase: 'production_released',
        estimatedWeightLbs: 24,
        estimatedWeightSource: 'external_estimate',
        dueAt: new Date(dueAt),
        createdAt: now,
        updatedAt: now,
      }),
    ]);
    expect(afterOrders).toEqual([
      expect.objectContaining({
        id: ids.productionOrder,
        orderDemandId: ids.demand,
        operationalStatus: 'intake_pending',
        executionStatus: 'unassigned',
        resolutionState: 'open',
        derivedWeightLbs: 24,
        derivedWeightSource: 'external_estimate',
        bagCount: null,
        intakeVersion: 0,
        version: 1,
        createdAt: now,
        updatedAt: now,
      }),
    ]);
    expect(afterEvents).toEqual([
      expect.objectContaining({
        id: ids.event,
        locationId,
        eventType: 'fulfillment_demand_applied',
        entityType: 'order_demand',
        entityId: ids.demand,
        actorId: '00000000-0000-4000-8000-000000000000',
        expectedVersion: null,
        idempotencyKey: 'apply-demand-conformance-replay',
        payload: {
          outcome: 'applied',
          _idempotency: {
            version: 1,
            command: commandIdentity(scenario.commands[0]!),
            result: {
              orderDemandId: ids.demand,
              productionOrderId: ids.productionOrder,
              outcome: 'applied',
              replayed: false,
            },
          },
        },
      }),
    ]);
  }

  if (scenario.name.startsWith('unweighted demand')) {
    expect(afterDemands).toEqual([
      expect.objectContaining({
        estimatedWeightLbs: null,
        estimatedWeightSource: null,
        phase: 'expected',
      }),
    ]);
    expect(afterOrders).toEqual([]);
  }

  if (scenario.name.startsWith('new weight materializes'))
    expect(afterOrders).toEqual([
      expect.objectContaining({
        id: ids.productionOrder,
        operationalStatus: 'release_pending',
        version: 1,
      }),
    ]);

  if (scenario.name.startsWith('manual admission'))
    expect(afterOrders).toEqual([
      expect.objectContaining({
        operationalStatus: 'eligible',
        admissionOverride: 'released',
        bagCount: 2,
        intakeVersion: 1,
        version: 3,
      }),
    ]);

  if (scenario.name.startsWith('source withdrawal'))
    expect(afterOrders).toEqual([
      expect.objectContaining({
        operationalStatus: 'ineligible',
        admissionOverride: null,
        bagCount: 2,
        intakeVersion: 1,
        version: 3,
      }),
    ]);

  if (
    scenario.fixture === 'resolved' ||
    scenario.fixture === 'scheduled' ||
    scenario.fixture === 'finished'
  )
    expect(afterOrders).toEqual(beforeOrders);

  if (scenario.mutation === 'suppress_demand_update') {
    expect(afterDemands).toEqual(stateArray(observation.before, 'demands'));
    expect(afterOrders).not.toEqual(beforeOrders);
    expect(afterOrders).toEqual([
      expect.objectContaining({ version: 2, derivedWeightLbs: 33 }),
    ]);
  }

  if (
    scenario.mutation === 'order_cas_miss' ||
    scenario.mutation === 'event_id_collision' ||
    scenario.mutation === 'receipt_collision'
  )
    expect(normalizeState(observation.after, scenario)).toEqual(
      normalizeState(observation.before, scenario),
    );
};

describe('production.apply-fulfillment-demand.v1 PostgreSQL conformance', () => {
  it.each(applyFulfillmentDemandConformanceScenarios)(
    '$name',
    async (scenario) => {
      const observation = await observeVariant(scenario);

      const outcomeSummaries = observation.outcomes.map(outcomeSummary);
      expect(
        scenario.execution === 'concurrent'
          ? sorted(outcomeSummaries)
          : outcomeSummaries,
      ).toEqual(
        scenario.execution === 'concurrent'
          ? sorted(scenario.expectedOutcomes)
          : scenario.expectedOutcomes,
      );
      expect(observation.usedIds).toEqual(scenario.generatedIds);
      expect(observation.clockReads).toBe(scenario.expectedClockReads);
      expect(observation.signals).toEqual([]);

      const transactionExpectations = expectedTransactions(
        observation.outcomes,
      );
      expect(
        scenario.execution === 'concurrent'
          ? sorted(observation.transactions)
          : observation.transactions,
      ).toEqual(
        scenario.execution === 'concurrent'
          ? sorted(transactionExpectations)
          : transactionExpectations,
      );

      expect(
        stateArray(observation.after, 'events').length -
          stateArray(observation.before, 'events').length,
      ).toBe(scenario.expectedEventDelta);
      expect(
        liveRevisionTotal(observation.after) -
          liveRevisionTotal(observation.before),
      ).toBe(scenario.expectedLiveRevisionDelta);
      assertScenarioDetails(scenario, observation);
    },
  );
});

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

type LockBlocker = Readonly<{
  release: () => void;
  done: Promise<void>;
}>;

const holdLock = async (
  acquire: (transaction: PostgresTransaction) => Promise<unknown>,
): Promise<LockBlocker> => {
  let signalReady: () => void = () => undefined;
  let signalRelease: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    signalReady = resolve;
  });
  const released = new Promise<void>((resolve) => {
    signalRelease = resolve;
  });
  const done = database.db.transaction(async (transaction) => {
    await acquire(transaction);
    signalReady();
    await released;
  });
  await ready;
  return { release: signalRelease, done };
};

const waitForBlockedLock = async (
  lockType: 'advisory' | 'transactionid',
): Promise<boolean> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [row] = await database.db.execute<{ waiting: number }>(sql`
      select count(*)::int as waiting
      from pg_locks as locks
      inner join pg_stat_activity as activity on activity.pid = locks.pid
      where activity.datname = current_database()
        and locks.locktype = ${lockType}
        and locks.granted = false
    `);
    if ((row?.waiting ?? 0) > 0) return true;
    await delay(10);
  }
  return false;
};

const tryLocationLock = async (): Promise<boolean> =>
  database.db.transaction(async (transaction) => {
    const [row] = await transaction.execute<{ locked: boolean }>(sql`
      select pg_try_advisory_xact_lock(
        hashtext('production-scheduling'),
        hashtext(${locationId})
      ) as locked
    `);
    return row?.locked ?? false;
  });

const tryFulfillmentLock = async (): Promise<boolean> =>
  database.db.transaction(async (transaction) => {
    const [row] = await transaction.execute<{ locked: boolean }>(sql`
      select pg_try_advisory_xact_lock(
        hashtext(${`fulfillment-demand:${ids.fulfillment}`})
      ) as locked
    `);
    return row?.locked ?? false;
  });

const scenarioNamed = (
  name: string,
): ApplyFulfillmentDemandConformanceScenario => {
  const scenario = applyFulfillmentDemandConformanceScenarios.find(
    (candidate) => candidate.name === name,
  );
  if (scenario === undefined) return expect.unreachable(`Missing ${name}.`);
  return scenario;
};

const runLockCommand = async (
  scenario: ApplyFulfillmentDemandConformanceScenario,
): Promise<CanonicalOutcome> => {
  const idSequence = sequenceIds(scenario.generatedIds);
  const execute = makeExecutor({
    ids: idSequence.source,
    clock: { now: () => now },
    signals: [],
    transactions: [],
  });
  return captureOutcome(execute, scenario.commands[0]!);
};

describe('production.apply-fulfillment-demand.v1 lock order', () => {
  it('waits on location scheduling before attempting fulfillment', async () => {
    await removeFaults();
    await database.reset();
    await seed('fresh');
    const blocker = await holdLock((transaction) =>
      transaction.execute(sql`
          select pg_advisory_xact_lock(
            hashtext('production-scheduling'),
            hashtext(${locationId})
          )
        `),
    );
    const scenario = scenarioNamed(
      'weighted create replays exactly and rejects divergent key reuse',
    );
    const outcome = runLockCommand(scenario);
    try {
      expect(await waitForBlockedLock('advisory')).toBe(true);
      expect(await tryFulfillmentLock()).toBe(true);
    } finally {
      blocker.release();
      await blocker.done;
    }
    await expect(outcome).resolves.toMatchObject({ kind: 'success' });
  });

  it('holds location scheduling while waiting on fulfillment', async () => {
    await removeFaults();
    await database.reset();
    await seed('fresh');
    const blocker = await holdLock((transaction) =>
      transaction.execute(sql`
          select pg_advisory_xact_lock(
            hashtext(${`fulfillment-demand:${ids.fulfillment}`})
          )
        `),
    );
    const scenario = scenarioNamed(
      'weighted create replays exactly and rejects divergent key reuse',
    );
    const outcome = runLockCommand(scenario);
    try {
      expect(await waitForBlockedLock('advisory')).toBe(true);
      expect(await tryLocationLock()).toBe(false);
    } finally {
      blocker.release();
      await blocker.done;
    }
    await expect(outcome).resolves.toMatchObject({ kind: 'success' });
  });

  it('holds both advisory locks before waiting on the order row', async () => {
    await removeFaults();
    await database.reset();
    await seed('weighted');
    const blocker = await holdLock((transaction) =>
      transaction
        .select({
          id: presslyPostgresOwnerSchemas.production.productionOrders.id,
        })
        .from(presslyPostgresOwnerSchemas.production.productionOrders)
        .where(
          eq(
            presslyPostgresOwnerSchemas.production.productionOrders.id,
            ids.productionOrder,
          ),
        )
        .for('update'),
    );
    const scenario = scenarioNamed(
      'newer weighted source truth updates open Production work',
    );
    const outcome = runLockCommand(scenario);
    try {
      expect(await waitForBlockedLock('transactionid')).toBe(true);
      expect(await tryLocationLock()).toBe(false);
      expect(await tryFulfillmentLock()).toBe(false);
    } finally {
      blocker.release();
      await blocker.done;
    }
    await expect(outcome).resolves.toMatchObject({ kind: 'success' });
  });
});
