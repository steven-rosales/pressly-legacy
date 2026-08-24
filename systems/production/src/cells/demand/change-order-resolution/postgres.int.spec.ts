import { proveOperation } from '@pressly/testkit/operation-proof';
import { changeOrderResolutionCellDeclaration } from './cell.ts';
import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import { createPostgresRuntime } from '@pressly/postgres/client';
import { asc, eq, sql } from '@pressly/postgres/query';
import type { IdSource } from '@pressly/cells/id-source';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { changeOrderResolutionContract } from './contract.ts';
import {
  makeExecuteChangeOrderResolution,
  type ExecuteChangeOrderResolution,
} from './execute.ts';
import { changeOrderResolutionIdempotency } from './idempotency.ts';
import { makeChangeOrderResolutionPostgresRepository } from './postgres.ts';

const databaseUrl = getTestDatabaseUrl(
  'PRESSLY_TEST_DATABASE_URL',
  'postgres://pressly:pressly@localhost:55434/pressly_test',
);
const resetDatabaseUrl = getTestDatabaseUrl(
  'PRESSLY_TEST_DATABASE_RESET_URL',
  databaseUrl,
);
const database = createTestDatabaseRuntime({
  databaseUrl,
  resetDatabaseUrl,
  tableNames: [
    'work_events',
    'production_order_stage_attempts',
    'stage_runs',
    'production_batch_orders',
    'production_batches',
    'production_runs',
    'schedule_runs',
    'production_shift_selected_orders',
    'production_shift_selections',
    'scheduler_configs',
    'production_orders',
    'production_shifts',
    'production_stations',
    'order_demands',
    'production_locations',
  ],
  maxConnections: 4,
});
const faultDatabase = createPostgresRuntime({
  databaseUrl: resetDatabaseUrl,
  schema: productionTestSchema,
  maxConnections: 1,
});

const removeLateCasFault = async (): Promise<void> => {
  await faultDatabase.db.execute(
    sql`drop trigger if exists change_order_resolution_late_cas on production_orders`,
  );
  await faultDatabase.db.execute(
    sql`drop function if exists change_order_resolution_reject_update()`,
  );
};

const installLateCasFault = async (): Promise<void> => {
  await faultDatabase.db.execute(
    sql`create function change_order_resolution_reject_update() returns trigger language plpgsql as $$ begin return null; end; $$`,
  );
  await faultDatabase.db.execute(
    sql`create trigger change_order_resolution_late_cas before update on production_orders for each row execute function change_order_resolution_reject_update()`,
  );
};

beforeAll(async () => {
  await database.check();
  await faultDatabase.check();
});
beforeEach(async () => {
  await removeLateCasFault();
  await database.reset();
});
afterAll(async () => {
  await removeLateCasFault();
  await database.close();
  await faultDatabase.close();
});

const ids = Object.freeze({
  actor: '17000000-0000-4000-8000-000000000001',
  sourceOrder: '17000000-0000-4000-8000-000000000002',
  fulfillment: '17000000-0000-4000-8000-000000000003',
  demand: '17000000-0000-4000-8000-000000000004',
  productionOrder: '17000000-0000-4000-8000-000000000005',
  shift: '17000000-0000-4000-8000-000000000006',
  event: '17000000-0000-4000-8000-000000000007',
  secondEvent: '17000000-0000-4000-8000-000000000008',
  evidenceEvent: '17000000-0000-4000-8000-000000000009',
  collision: '17000000-0000-4000-8000-000000000010',
  schedulerConfig: '17000000-0000-4000-8000-000000000011',
  schedule: '17000000-0000-4000-8000-000000000012',
  run: '17000000-0000-4000-8000-000000000013',
  batch: '17000000-0000-4000-8000-000000000014',
  station: '17000000-0000-4000-8000-000000000015',
  stage: '17000000-0000-4000-8000-000000000016',
  membership: '17000000-0000-4000-8000-000000000017',
  attempt: '17000000-0000-4000-8000-000000000018',
  missing: '17000000-0000-4000-8000-000000000099',
});
const locationId = 'location-change-order-resolution';
const businessId = '00000000-0000-4000-8000-000000000100';
const now = new Date('2026-08-21T15:00:00.000Z');
const createdAt = new Date('2026-08-21T12:00:00.000Z');
const dueAt = new Date('2026-08-22T20:00:00.000Z');

type SeedOptions = Readonly<{
  includeOrder?: boolean;
  resolutionState?: 'open' | 'resolved_without_production';
  version?: number;
  operationalStatus?:
    | 'release_pending'
    | 'intake_pending'
    | 'eligible'
    | 'ineligible'
    | 'scheduled'
    | 'finished';
  executionStatus?: 'unassigned' | 'scheduled' | 'finished';
  sourceAdmissionState?: 'unreleased' | 'released' | 'withdrawn';
  sourceCommercialState?: 'open' | 'completed' | 'canceled';
  demandPhase?:
    | 'expected'
    | 'inbound'
    | 'production_released'
    | 'post_production'
    | 'withdrawn';
  sourceEstimatedWeightLbs?: number | null;
  sourceEstimatedWeightSource?: string | null;
  admissionOverride?: 'released' | null;
  bagCount?: number | null;
  hasIntake?: boolean;
  priority?: boolean;
  pendingPlacement?: unknown | null;
}>;

const seed = async (options: SeedOptions = {}): Promise<void> => {
  await database.db.insert(productionTestSchema.productionLocations).values({
    id: locationId,
    businessId,
    name: 'Change Order Resolution Facility',
    timezone: 'America/New_York',
  });
  if (options.includeOrder === false) return;

  const resolutionState = options.resolutionState ?? 'open';
  const admissionOverride = options.admissionOverride ?? null;
  const bagCount = options.bagCount === undefined ? null : options.bagCount;
  const hasIntake = options.hasIntake ?? bagCount !== null;
  const sourceAdmissionState = options.sourceAdmissionState ?? 'unreleased';
  await database.db.insert(productionTestSchema.orderDemands).values({
    id: ids.demand,
    fulfillmentId: ids.fulfillment,
    fulfillmentVersion: 1,
    projectionHash: 'a'.repeat(64),
    admissionState: sourceAdmissionState,
    commercialState: options.sourceCommercialState ?? 'open',
    displayReference: 'RESOLUTION-1',
    locationId,
    revisionAt: createdAt,
    phase: options.demandPhase ?? 'expected',
    estimatedWeightLbs:
      options.sourceEstimatedWeightLbs === undefined
        ? 24
        : options.sourceEstimatedWeightLbs,
    estimatedWeightSource:
      options.sourceEstimatedWeightSource === undefined
        ? 'external_estimate'
        : options.sourceEstimatedWeightSource,
    dueAt,
    createdAt,
    updatedAt: createdAt,
  });
  await database.db.insert(productionTestSchema.productionOrders).values({
    id: ids.productionOrder,
    orderDemandId: ids.demand,
    locationId,
    dueAt,
    priority: options.priority ?? false,
    operationalStatus: options.operationalStatus ?? 'release_pending',
    executionStatus: options.executionStatus ?? 'unassigned',
    resolutionState,
    ...(resolutionState === 'resolved_without_production'
      ? {
          resolvedAt: createdAt,
          resolvedBy: ids.actor,
          resolutionReason: 'processor_not_in_use',
          resolutionNote: null,
        }
      : {}),
    derivedWeightLbs: 24,
    derivedWeightSource: 'archived_estimate',
    bagCount,
    bagCountSource: hasIntake ? 'operator_intake' : null,
    intakeRecordedAt: hasIntake ? createdAt : null,
    intakeVersion: hasIntake ? 1 : 0,
    admissionOverride,
    admissionOverrideAt: admissionOverride === null ? null : createdAt,
    admissionOverrideBy: admissionOverride === null ? null : ids.actor,
    pendingPlacement: options.pendingPlacement ?? null,
    eligibleAt: options.operationalStatus === 'eligible' ? createdAt : null,
    version: options.version ?? 1,
    createdAt,
    updatedAt: createdAt,
  });
};

const idSource = (values: readonly string[] = [ids.event]): IdSource => {
  let index = 0;
  return {
    next: () =>
      values[index++] ??
      `27000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  };
};

const seedShift = async (): Promise<void> => {
  await database.db.insert(productionTestSchema.productionShifts).values({
    id: ids.shift,
    locationId,
    startsAt: createdAt,
    endsAt: new Date('2026-08-21T22:00:00.000Z'),
    timezone: 'America/New_York',
    status: 'open',
    effectiveFolderCount: 2,
  });
};

const seedSchedule = async (inputSnapshot: unknown): Promise<void> => {
  await seedShift();
  await database.db.insert(productionTestSchema.schedulerConfigs).values({
    id: ids.schedulerConfig,
    locationId,
    pulseMinutes: 30,
    foldLbsPerFolderMinute: 1,
    version: 1,
    stageFitAssertion: {},
    assertedBy: ids.actor,
    publishedAt: createdAt,
  });
  await database.db.insert(productionTestSchema.scheduleRuns).values({
    id: ids.schedule,
    locationId,
    productionShiftId: ids.shift,
    schedulerConfigId: ids.schedulerConfig,
    status: 'rejected',
    inputSnapshot,
    inputSnapshotHash: 'c'.repeat(64),
    outputPlan: {},
    outputPlanHash: 'd'.repeat(64),
    algorithmVersion: 'test-resolution-v1',
    pulseCapacityLbs: 100,
    batchCount: 1,
    makespanMinutes: 60,
    plannedCompletionAt: new Date('2026-08-21T21:00:00.000Z'),
    createdAt,
  });
};

const seedProductionHistory = async (
  evidence: 'batch membership' | 'stage attempt',
): Promise<void> => {
  await seedSchedule({ orders: [] });
  await database.db.insert(productionTestSchema.productionRuns).values({
    id: ids.run,
    locationId,
    productionShiftId: ids.shift,
    scheduleRunId: ids.schedule,
    status: 'started',
    startedAt: createdAt,
    plannedCompletionAt: new Date('2026-08-21T21:00:00.000Z'),
  });
  await database.db.insert(productionTestSchema.productionBatches).values({
    id: ids.batch,
    locationId,
    productionRunId: ids.run,
    sequenceIndex: 0,
    status: 'queued',
    pulseCapacityLbs: 100,
    derivedWeightLbs: 24,
    pulseMinutes: 30,
    plannedDoneAt: new Date('2026-08-21T20:00:00.000Z'),
  });
  if (evidence === 'batch membership') {
    await database.db
      .insert(productionTestSchema.productionBatchOrders)
      .values({
        id: ids.membership,
        locationId,
        productionBatchId: ids.batch,
        productionOrderId: ids.productionOrder,
        active: false,
        placementProvenance: 'initial_schedule',
        placedBy: ids.actor,
        releasedAt: now,
        releasedBy: ids.actor,
        releaseReason: 'test_history',
      });
    return;
  }
  await database.db.insert(productionTestSchema.stations).values({
    id: ids.station,
    locationId,
    kind: 'sorting',
    label: 'Resolution history station',
    sortOrder: 1,
  });
  await database.db.insert(productionTestSchema.stageRuns).values({
    id: ids.stage,
    locationId,
    productionBatchId: ids.batch,
    stationId: ids.station,
    stageKind: 'sorting',
    status: 'planned',
    plannedStartAt: createdAt,
    plannedEndAt: new Date('2026-08-21T13:00:00.000Z'),
  });
  await database.db
    .insert(productionTestSchema.productionOrderStageAttempts)
    .values({
      id: ids.attempt,
      locationId,
      productionRunId: ids.run,
      productionOrderId: ids.productionOrder,
      stageRunId: ids.stage,
      stageKind: 'sorting',
      attemptNumber: 1,
      status: 'released',
      assignmentReason: 'initial_schedule',
      assignedBy: ids.actor,
      releasedAt: now,
      releasedBy: ids.actor,
      releaseReason: 'test_history',
    });
};

const makeExecute = (
  input: {
    ids?: IdSource;
    observeUnitOfWork?: Parameters<
      typeof makeChangeOrderResolutionPostgresRepository
    >[0]['observeUnitOfWork'];
  } = {},
) =>
  makeExecuteChangeOrderResolution({
    repo: makeChangeOrderResolutionPostgresRepository(
      {
        db: database.db,
        ids: input.ids ?? idSource(),
        ...(input.observeUnitOfWork === undefined
          ? {}
          : { observeUnitOfWork: input.observeUnitOfWork }),
      },
      productionTestSchema,
    ),
    idempotency: changeOrderResolutionIdempotency,
    policy: productionRules,
    clock: { now: () => now },
  });

const serializedCommand = (
  input: {
    action?: 'resolve_without_production' | 'restore';
    reason?: string;
    note?: string | null;
    confirmReviewedFacts?: boolean;
    expectedVersion?: number;
    key?: string;
    productionOrderId?: string;
    sourceStatePrecondition?: Readonly<{
      commercialState: 'open';
      admissionState: 'unreleased';
    }>;
  } = {},
) => {
  const action = input.action ?? 'resolve_without_production';
  return {
    body:
      action === 'resolve_without_production'
        ? {
            action,
            reason: input.reason ?? 'processor_not_in_use',
            note: input.note ?? null,
            confirmReviewedFacts: input.confirmReviewedFacts ?? false,
            expectedVersion: input.expectedVersion ?? 1,
            idempotencyKey: input.key ?? 'resolve-order-command-1',
          }
        : {
            action,
            reason: input.reason ?? 'work_should_be_produced',
            note: input.note ?? null,
            expectedVersion: input.expectedVersion ?? 1,
            idempotencyKey: input.key ?? 'restore-order-command-1',
          },
    params: {
      locationId,
      productionOrderId: input.productionOrderId ?? ids.productionOrder,
    },
    actorId: ids.actor,
    ...(input.sourceStatePrecondition === undefined
      ? {}
      : { sourceStatePrecondition: input.sourceStatePrecondition }),
  };
};

const executeSerialized = async (
  execute: ExecuteChangeOrderResolution,
  serialized: ReturnType<typeof serializedCommand>,
): Promise<unknown> => {
  const decoded = changeOrderResolutionContract.input.decode(serialized);
  if (decoded.kind === 'invalid') return decoded;
  const outcome = await execute(decoded.value);
  return outcome.kind === 'success'
    ? {
        kind: 'success',
        value: changeOrderResolutionContract.output.encode(outcome.value),
      }
    : {
        kind: 'failure',
        failure: changeOrderResolutionContract.failure.encode(outcome.failure),
      };
};

const readState = async () => {
  const [order] = await database.db
    .select({
      resolutionState: productionTestSchema.productionOrders.resolutionState,
      resolvedAt: productionTestSchema.productionOrders.resolvedAt,
      resolvedBy: productionTestSchema.productionOrders.resolvedBy,
      resolutionReason: productionTestSchema.productionOrders.resolutionReason,
      resolutionNote: productionTestSchema.productionOrders.resolutionNote,
      dueAt: productionTestSchema.productionOrders.dueAt,
      derivedWeightLbs: productionTestSchema.productionOrders.derivedWeightLbs,
      derivedWeightSource:
        productionTestSchema.productionOrders.derivedWeightSource,
      operationalStatus:
        productionTestSchema.productionOrders.operationalStatus,
      admissionOverride:
        productionTestSchema.productionOrders.admissionOverride,
      admissionOverrideAt:
        productionTestSchema.productionOrders.admissionOverrideAt,
      admissionOverrideBy:
        productionTestSchema.productionOrders.admissionOverrideBy,
      pendingPlacement: productionTestSchema.productionOrders.pendingPlacement,
      eligibleAt: productionTestSchema.productionOrders.eligibleAt,
      version: productionTestSchema.productionOrders.version,
      updatedAt: productionTestSchema.productionOrders.updatedAt,
    })
    .from(productionTestSchema.productionOrders)
    .where(eq(productionTestSchema.productionOrders.id, ids.productionOrder));
  const events = await database.db
    .select({
      id: productionTestSchema.workEvents.id,
      eventType: productionTestSchema.workEvents.eventType,
      entityType: productionTestSchema.workEvents.entityType,
      entityId: productionTestSchema.workEvents.entityId,
      actorId: productionTestSchema.workEvents.actorId,
      expectedVersion: productionTestSchema.workEvents.expectedVersion,
      idempotencyKey: productionTestSchema.workEvents.idempotencyKey,
      payload: productionTestSchema.workEvents.payload,
    })
    .from(productionTestSchema.workEvents)
    .orderBy(asc(productionTestSchema.workEvents.id));
  const [location] = await database.db
    .select({ revision: productionTestSchema.productionLocations.liveRevision })
    .from(productionTestSchema.productionLocations)
    .where(eq(productionTestSchema.productionLocations.id, locationId));
  return {
    order: order ?? null,
    events,
    liveRevision: location?.revision ?? -1,
  };
};

describe('change order resolution serialized native Postgres cell', () => {
  proveOperation({
    operationId: 'production.change-order-resolution.v1',
    declaration: changeOrderResolutionCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'resolves once with exact receipt, replays, and rejects divergent reuse',
        proves: [
          'postgres-commit',
          'same-payload-replay',
          'divergent-key-conflict',
          'expected-rejection-no-partial-write',
        ],
        run: async () => {
          await seed();
          const observeUnitOfWork = vi.fn((unitOfWork) => unitOfWork);
          const execute = makeExecute({ observeUnitOfWork });
          const request = serializedCommand();

          await expect(executeSerialized(execute, request)).resolves.toEqual({
            kind: 'success',
            value: {
              locationId,
              orderId: ids.productionOrder,
              action: 'resolve_without_production',
              resolutionState: 'resolved_without_production',
              transitionedAt: now.toISOString(),
              version: 2,
              replayed: false,
            },
          });
          await expect(
            executeSerialized(execute, request),
          ).resolves.toMatchObject({
            kind: 'success',
            value: { version: 2, replayed: true },
          });
          await expect(
            executeSerialized(
              execute,
              serializedCommand({ reason: 'other', note: 'Different' }),
            ),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: { code: 'production_idempotency_conflict' },
          });

          const state = await readState();
          expect(observeUnitOfWork).toHaveBeenCalledOnce();
          expect(state.order).toMatchObject({
            resolutionState: 'resolved_without_production',
            resolvedAt: now,
            resolvedBy: ids.actor,
            resolutionReason: 'processor_not_in_use',
            resolutionNote: null,
            version: 2,
            updatedAt: now,
          });
          expect(state.events).toEqual([
            {
              id: ids.event,
              eventType: 'production_order_resolved_without_production',
              entityType: 'production_order',
              entityId: ids.productionOrder,
              actorId: ids.actor,
              expectedVersion: 1,
              idempotencyKey: 'resolve-order-command-1',
              payload: {
                action: 'resolve_without_production',
                from: 'open',
                resolutionState: 'resolved_without_production',
                reason: 'processor_not_in_use',
                note: null,
                reviewReasons: [],
                clearedPendingPlacement: false,
                version: 2,
                _idempotency: {
                  version: 1,
                  command: {
                    operation: 'production_order_resolved_without_production',
                    locationId,
                    actorId: ids.actor,
                    target: {
                      entityType: 'production_order',
                      entityId: ids.productionOrder,
                    },
                    expectedVersion: 1,
                    payload: {
                      action: 'resolve_without_production',
                      reason: 'processor_not_in_use',
                      note: null,
                      confirmReviewedFacts: false,
                    },
                  },
                  result: {
                    locationId,
                    orderId: ids.productionOrder,
                    action: 'resolve_without_production',
                    resolutionState: 'resolved_without_production',
                    transitionedAt: now.toISOString(),
                    version: 2,
                    replayed: false,
                  },
                },
              },
            },
          ]);
          expect(state.liveRevision).toBe(1);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.change-order-resolution.v1',
    declaration: changeOrderResolutionCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'replays concurrent identical commands after the location lock',
        proves: ['same-key-concurrency'],
        run: async () => {
          await seed();
          const execute = makeExecute();
          const request = serializedCommand({
            key: 'resolution-same-key-race',
          });
          const outcomes = await Promise.all([
            executeSerialized(execute, request),
            executeSerialized(execute, request),
          ]);
          expect(
            outcomes
              .flatMap((outcome) => {
                const value = (outcome as { value?: { replayed?: boolean } })
                  .value;
                return value?.replayed === undefined ? [] : [value.replayed];
              })
              .sort(),
          ).toEqual([false, true]);
          expect((await readState()).events).toHaveLength(1);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.change-order-resolution.v1',
    declaration: changeOrderResolutionCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'serializes distinct same-version commands so one wins',
        proves: ['declared-concurrency-race'],
        run: async () => {
          await seed();
          const outcomes = await Promise.all([
            executeSerialized(
              makeExecute({
                ids: idSource(['37000000-0000-4000-8000-000000000001']),
              }),
              serializedCommand({ key: 'resolution-version-race-1' }),
            ),
            executeSerialized(
              makeExecute({
                ids: idSource(['47000000-0000-4000-8000-000000000001']),
              }),
              serializedCommand({
                key: 'resolution-version-race-2',
                reason: 'duplicate_or_test',
              }),
            ),
          ]);
          expect(
            outcomes.filter(
              (outcome) => (outcome as { kind?: string }).kind === 'success',
            ),
          ).toHaveLength(1);
          expect(outcomes).toContainEqual(
            expect.objectContaining({
              kind: 'failure',
              failure: expect.objectContaining({
                code: 'production_order_version_conflict',
              }),
            }),
          );
          expect((await readState()).events).toHaveLength(1);
        },
      },
    ],
  });

  it('rechecks the trusted source state under the scheduling lock', async () => {
    await seed({ sourceAdmissionState: 'released' });
    const before = await readState();
    await expect(
      executeSerialized(
        makeExecute(),
        serializedCommand({
          sourceStatePrecondition: {
            commercialState: 'open',
            admissionState: 'unreleased',
          },
        }),
      ),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_order_source_state_conflict' },
    });
    expect(await readState()).toEqual(before);
  });

  it('requires review then clears only pending placement with exact reasons', async () => {
    await seed({
      hasIntake: true,
      bagCount: 2,
      admissionOverride: 'released',
      priority: true,
      pendingPlacement: { status: 'awaiting_confirmation' },
    });
    await expect(
      executeSerialized(makeExecute(), serializedCommand()),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_order_resolution_review_required' },
    });
    await expect(
      executeSerialized(
        makeExecute(),
        serializedCommand({
          confirmReviewedFacts: true,
          key: 'resolve-reviewed-command-1',
        }),
      ),
    ).resolves.toMatchObject({ kind: 'success' });
    const state = await readState();
    expect(state.order).toMatchObject({ pendingPlacement: null });
    expect(state.events[0]).toMatchObject({
      payload: {
        reviewReasons: [
          'intake_recorded',
          'manual_admission',
          'priority',
          'pending_placement',
        ],
        clearedPendingPlacement: true,
      },
    });
  });

  it.each([
    {
      name: 'current shift selection',
      arrange: async () => {
        await seedShift();
        await database.db
          .insert(productionTestSchema.productionShiftSelections)
          .values({
            productionShiftId: ids.shift,
            locationId,
            version: 1,
            selectedBy: ids.actor,
            selectedAt: createdAt,
            updatedAt: createdAt,
          });
        await database.db
          .insert(productionTestSchema.productionShiftSelectedOrders)
          .values({
            productionShiftId: ids.shift,
            locationId,
            productionOrderId: ids.productionOrder,
            selectedBy: ids.actor,
            selectedAt: createdAt,
          });
      },
    },
    {
      name: 'schedule snapshot',
      arrange: () => seedSchedule({ orders: [{ id: ids.productionOrder }] }),
    },
    {
      name: 'released batch membership',
      arrange: () => seedProductionHistory('batch membership'),
    },
    {
      name: 'released stage attempt',
      arrange: () => seedProductionHistory('stage attempt'),
    },
    {
      name: 'route work event',
      arrange: async () => {
        await database.db.insert(productionTestSchema.workEvents).values({
          id: ids.evidenceEvent,
          locationId,
          eventType: 'production_order_route_exception_recorded',
          entityType: 'production_order',
          entityId: ids.productionOrder,
          actorId: ids.actor,
          idempotencyKey: 'route-evidence-event',
          payload: {},
        });
      },
    },
  ])('blocks resolution after $name evidence', async ({ arrange }) => {
    await seed();
    await arrange();
    const before = await readState();
    await expect(
      executeSerialized(
        makeExecute(),
        serializedCommand({ confirmReviewedFacts: true }),
      ),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_order_resolution_blocked' },
    });
    expect(await readState()).toEqual(before);
  });

  it('blocks immutable historical selection evidence', async () => {
    await seed();
    await database.db.insert(productionTestSchema.workEvents).values({
      id: ids.evidenceEvent,
      locationId,
      eventType: 'production_shift_selection_replaced',
      entityType: 'production_shift',
      entityId: ids.shift,
      actorId: ids.actor,
      idempotencyKey: 'selection-evidence-event',
      payload: { selectedOrderIds: [ids.productionOrder] },
    });
    const before = await readState();
    await expect(
      executeSerialized(
        makeExecute(),
        serializedCommand({ confirmReviewedFacts: true }),
      ),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_order_resolution_blocked' },
    });
    expect(await readState()).toEqual(before);
  });

  it('restores the current source projection and clears stale source override', async () => {
    await seed({
      resolutionState: 'resolved_without_production',
      version: 2,
      admissionOverride: 'released',
      sourceAdmissionState: 'released',
      demandPhase: 'production_released',
      bagCount: 2,
      operationalStatus: 'release_pending',
    });
    const currentDueAt = new Date('2026-08-23T18:00:00.000Z');
    await database.db
      .update(productionTestSchema.orderDemands)
      .set({
        dueAt: currentDueAt,
        estimatedWeightLbs: 48,
        estimatedWeightSource: 'current_source',
      })
      .where(eq(productionTestSchema.orderDemands.id, ids.demand));

    await expect(
      executeSerialized(
        makeExecute({ ids: idSource([ids.secondEvent]) }),
        serializedCommand({
          action: 'restore',
          expectedVersion: 2,
        }),
      ),
    ).resolves.toMatchObject({
      kind: 'success',
      value: { action: 'restore', resolutionState: 'open', version: 3 },
    });
    const state = await readState();
    expect(state.order).toEqual({
      resolutionState: 'open',
      resolvedAt: null,
      resolvedBy: null,
      resolutionReason: null,
      resolutionNote: null,
      dueAt: currentDueAt,
      derivedWeightLbs: 48,
      derivedWeightSource: 'current_source',
      operationalStatus: 'eligible',
      admissionOverride: null,
      admissionOverrideAt: null,
      admissionOverrideBy: null,
      pendingPlacement: null,
      eligibleAt: now,
      version: 3,
      updatedAt: now,
    });
    expect(state.events[0]).toMatchObject({
      eventType: 'production_order_restored',
      payload: {
        restoredSourceProjection: {
          dueAt: currentDueAt.toISOString(),
          derivedWeightLbs: 48,
          operationalStatus: 'eligible',
        },
      },
    });
    expect(state.liveRevision).toBe(1);
  });

  it.each([
    {
      name: 'missing order',
      seed: { includeOrder: false } satisfies SeedOptions,
      request: { productionOrderId: ids.missing },
      code: 'production_order_not_found',
    },
    {
      name: 'stale version',
      seed: {} satisfies SeedOptions,
      request: { expectedVersion: 2 },
      code: 'production_order_version_conflict',
    },
    {
      name: 'wrong resolve event',
      seed: {
        resolutionState: 'resolved_without_production',
      } satisfies SeedOptions,
      request: {},
      code: 'production_order_resolution_event_not_allowed',
    },
    {
      name: 'missing restore estimate',
      seed: {
        resolutionState: 'resolved_without_production',
        sourceEstimatedWeightLbs: null,
        sourceEstimatedWeightSource: null,
      } satisfies SeedOptions,
      request: { action: 'restore' as const },
      code: 'production_order_restore_demand_invalid',
    },
  ])('returns $code for $name without durable effect', async (scenario) => {
    await seed(scenario.seed);
    const before = await readState();
    await expect(
      executeSerialized(makeExecute(), serializedCommand(scenario.request)),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: scenario.code },
    });
    expect(await readState()).toEqual(before);
  });

  it('returns the late CAS conflict without a state or event mutation', async () => {
    await seed();
    const before = await readState();
    await installLateCasFault();
    try {
      await expect(
        executeSerialized(makeExecute(), serializedCommand()),
      ).resolves.toEqual({
        kind: 'failure',
        failure: {
          kind: 'conflict',
          code: 'production_order_version_conflict',
          message:
            'The order changed before its archive status was updated. Refresh and try again.',
          safeMessage:
            'The order changed before its archive status was updated. Refresh and try again.',
        },
      });
    } finally {
      await removeLateCasFault();
    }
    expect(await readState()).toEqual(before);
  });

  proveOperation({
    operationId: 'production.change-order-resolution.v1',
    declaration: changeOrderResolutionCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rolls back resolution and live revision after a late event failure',
        proves: ['unexpected-failure-rollback'],
        run: async () => {
          await seed();
          await database.db.insert(productionTestSchema.workEvents).values({
            id: ids.collision,
            locationId,
            eventType: 'fixture',
            entityType: 'production_order',
            entityId: ids.productionOrder,
            actorId: ids.actor,
            idempotencyKey: 'fixture-event',
            payload: {},
          });
          const before = await readState();
          await expect(
            executeSerialized(
              makeExecute({ ids: idSource([ids.collision]) }),
              serializedCommand(),
            ),
          ).rejects.toMatchObject({
            code: 'production_order_resolution_change_failed',
            status: 503,
          });
          expect(await readState()).toEqual(before);
        },
      },
    ],
  });
});
