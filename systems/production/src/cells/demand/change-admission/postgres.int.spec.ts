import { proveOperation } from '@pressly/testkit/operation-proof';
import { changeAdmissionCellDeclaration } from './cell.ts';
import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import { eq } from '@pressly/postgres/query';
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
import { changeAdmissionContract } from './contract.ts';
import {
  makeExecuteChangeAdmission,
  type ExecuteChangeAdmission,
} from './execute.ts';
import { changeAdmissionIdempotency } from './idempotency.ts';
import { makeChangeAdmissionPostgresRepository } from './postgres.ts';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
  tableNames: [
    'work_events',
    'production_batch_orders',
    'production_batches',
    'production_runs',
    'schedule_runs',
    'scheduler_configs',
    'production_shift_selected_orders',
    'production_shift_selections',
    'production_orders',
    'production_shifts',
    'order_demands',
    'production_locations',
  ],
  maxConnections: 4,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : {
        resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'],
      }),
});

beforeAll(database.check);
beforeEach(database.reset);
afterAll(database.close);

const ids = Object.freeze({
  actor: '19000000-0000-4000-8000-000000000001',
  sourceOrder: '19000000-0000-4000-8000-000000000002',
  fulfillment: '19000000-0000-4000-8000-000000000003',
  demand: '19000000-0000-4000-8000-000000000004',
  productionOrder: '19000000-0000-4000-8000-000000000005',
  shift: '19000000-0000-4000-8000-000000000006',
  event: '19000000-0000-4000-8000-000000000007',
  collision: '19000000-0000-4000-8000-000000000008',
});

const locationId = 'location-change-admission';
const businessId = '00000000-0000-4000-8000-000000000100';
const now = new Date('2026-08-21T15:00:00.000Z');
const createdAt = new Date('2026-08-21T12:00:00.000Z');

type SeedOptions = Readonly<{
  includeOrder?: boolean;
  sourceAdmissionState?: 'released' | 'unreleased' | 'withdrawn';
  operationalStatus?:
    | 'eligible'
    | 'finished'
    | 'ineligible'
    | 'intake_pending'
    | 'release_pending'
    | 'scheduled';
  executionStatus?: 'finished' | 'scheduled' | 'unassigned';
  resolutionState?: 'open' | 'resolved_without_production';
  admissionOverride?: 'released' | null;
  bagCount?: number | null;
  version?: number;
}>;

const seed = async (options: SeedOptions = {}): Promise<void> => {
  await database.db.insert(productionTestSchema.productionLocations).values({
    id: locationId,
    businessId,
    name: 'Change Admission Facility',
    timezone: 'America/New_York',
  });
  if (options.includeOrder === false) return;

  const dueAt = new Date('2026-08-22T20:00:00.000Z');
  const admissionOverride = options.admissionOverride ?? null;
  const bagCount = options.bagCount === undefined ? 2 : options.bagCount;
  const resolutionState = options.resolutionState ?? 'open';
  await database.db.insert(productionTestSchema.orderDemands).values({
    id: ids.demand,
    fulfillmentId: ids.fulfillment,
    fulfillmentVersion: 1,
    projectionHash: 'a'.repeat(64),
    admissionState: options.sourceAdmissionState ?? 'unreleased',
    commercialState: 'open',
    displayReference: 'ADMISSION-1',
    locationId,
    revisionAt: createdAt,
    phase: 'production_released',
    estimatedWeightLbs: 25,
    estimatedWeightSource: 'test_estimate',
    dueAt,
    createdAt,
    updatedAt: createdAt,
  });
  await database.db.insert(productionTestSchema.productionOrders).values({
    id: ids.productionOrder,
    orderDemandId: ids.demand,
    locationId,
    dueAt,
    priority: false,
    operationalStatus: options.operationalStatus ?? 'release_pending',
    executionStatus: options.executionStatus ?? 'unassigned',
    resolutionState,
    ...(resolutionState === 'resolved_without_production'
      ? {
          resolvedAt: createdAt,
          resolvedBy: ids.actor,
          resolutionReason: 'other',
          resolutionNote: 'Archived fixture',
        }
      : {}),
    derivedWeightLbs: 25,
    derivedWeightSource: 'test_estimate',
    bagCount,
    bagCountSource: bagCount === null ? null : 'operator_intake',
    intakeRecordedAt: bagCount === null ? null : createdAt,
    intakeVersion: bagCount === null ? 0 : 1,
    admissionOverride,
    admissionOverrideAt: admissionOverride === null ? null : createdAt,
    admissionOverrideBy: admissionOverride === null ? null : ids.actor,
    version: options.version ?? 1,
    createdAt,
    updatedAt: createdAt,
  });
};

const generatedIds = (first: string = ids.event): IdSource => {
  let next = 0;
  return {
    next: () =>
      next++ === 0
        ? first
        : `29000000-0000-4000-8000-${String(next).padStart(12, '0')}`,
  };
};

const makeExecute = (
  input: {
    idSource?: IdSource;
    observeUnitOfWork?: Parameters<
      typeof makeChangeAdmissionPostgresRepository
    >[0]['observeUnitOfWork'];
  } = {},
) =>
  makeExecuteChangeAdmission({
    repo: makeChangeAdmissionPostgresRepository(
      {
        db: database.db,
        ids: input.idSource ?? generatedIds(),
        ...(input.observeUnitOfWork === undefined
          ? {}
          : { observeUnitOfWork: input.observeUnitOfWork }),
      },
      productionTestSchema,
    ),
    idempotency: changeAdmissionIdempotency,
    policy: productionRules,
    clock: { now: () => now },
  });

const serializedCommand = (
  input: {
    key?: string;
    target?: 'released' | 'source';
    expectedVersion?: number;
    productionOrderId?: string;
  } = {},
) => ({
  params: {
    locationId,
    productionOrderId: input.productionOrderId ?? ids.productionOrder,
  },
  body: {
    target: input.target ?? 'released',
    expectedVersion: input.expectedVersion ?? 1,
    idempotencyKey: input.key ?? 'change-admission-command-1',
  },
  actorId: ids.actor,
});

const executeSerialized = async (
  execute: ExecuteChangeAdmission,
  serialized: ReturnType<typeof serializedCommand>,
): Promise<unknown> => {
  const decoded = changeAdmissionContract.input.decode(serialized);
  if (decoded.kind === 'invalid') return decoded;
  const outcome = await execute(decoded.value);
  if (outcome.kind === 'success')
    return {
      kind: 'success',
      value: changeAdmissionContract.output.encode(outcome.value),
    };
  return {
    kind: 'failure',
    failure: changeAdmissionContract.failure.encode(outcome.failure),
  };
};

const readState = async () => {
  const [order] = await database.db
    .select({
      admissionOverride:
        productionTestSchema.productionOrders.admissionOverride,
      admissionOverrideAt:
        productionTestSchema.productionOrders.admissionOverrideAt,
      admissionOverrideBy:
        productionTestSchema.productionOrders.admissionOverrideBy,
      status: productionTestSchema.productionOrders.operationalStatus,
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
    .from(productionTestSchema.workEvents);
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

describe('change admission serialized native Postgres cell', () => {
  proveOperation({
    operationId: 'production.change-admission.v1',
    declaration: changeAdmissionCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'commits once, records the exact receipt, replays, and rejects divergent reuse',
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
              admissionOverride: 'released',
              status: 'eligible',
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
            executeSerialized(execute, serializedCommand({ target: 'source' })),
          ).resolves.toMatchObject({
            kind: 'failure',
            failure: {
              code: 'production_idempotency_conflict',
              kind: 'conflict',
            },
          });

          const state = await readState();
          expect(observeUnitOfWork).toHaveBeenCalledOnce();
          expect(state.order).toEqual({
            admissionOverride: 'released',
            admissionOverrideAt: now,
            admissionOverrideBy: ids.actor,
            status: 'eligible',
            eligibleAt: now,
            version: 2,
            updatedAt: now,
          });
          expect(state.events).toEqual([
            {
              id: ids.event,
              eventType: 'production_admission_changed',
              entityType: 'production_order',
              entityId: ids.productionOrder,
              actorId: ids.actor,
              expectedVersion: 1,
              idempotencyKey: 'change-admission-command-1',
              payload: {
                target: 'released',
                sourceAdmissionState: 'unreleased',
                admissionOverride: 'released',
                status: 'eligible',
                version: 2,
                _idempotency: {
                  version: 1,
                  command: {
                    operation: 'production_admission_changed',
                    locationId,
                    actorId: ids.actor,
                    target: {
                      entityType: 'production_order',
                      entityId: ids.productionOrder,
                    },
                    expectedVersion: 1,
                    payload: { target: 'released' },
                  },
                  result: {
                    locationId,
                    orderId: ids.productionOrder,
                    admissionOverride: 'released',
                    status: 'eligible',
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
    operationId: 'production.change-admission.v1',
    declaration: changeAdmissionCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'serializes same-version writes so exactly one commits',
        proves: ['declared-concurrency-race'],
        run: async () => {
          await seed();
          const execute = makeExecute();
          const outcomes = await Promise.all([
            executeSerialized(
              execute,
              serializedCommand({ key: 'admission-race-1' }),
            ),
            executeSerialized(
              execute,
              serializedCommand({ key: 'admission-race-2' }),
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
          const state = await readState();
          expect(state.events).toHaveLength(1);
          expect(state.liveRevision).toBe(1);
          expect(state.order).toMatchObject({ version: 2 });
        },
      },
    ],
  });

  it('returns an uncommitted manual release to source-owned readiness', async () => {
    await seed({
      operationalStatus: 'eligible',
      admissionOverride: 'released',
    });

    await expect(
      executeSerialized(makeExecute(), serializedCommand({ target: 'source' })),
    ).resolves.toEqual({
      kind: 'success',
      value: {
        locationId,
        orderId: ids.productionOrder,
        admissionOverride: null,
        status: 'release_pending',
        version: 2,
        replayed: false,
      },
    });
    const state = await readState();
    expect(state.order).toEqual({
      admissionOverride: null,
      admissionOverrideAt: null,
      admissionOverrideBy: null,
      status: 'release_pending',
      eligibleAt: null,
      version: 2,
      updatedAt: now,
    });
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toMatchObject({
      eventType: 'production_admission_changed',
      payload: {
        target: 'source',
        sourceAdmissionState: 'unreleased',
        admissionOverride: null,
        status: 'release_pending',
        version: 2,
      },
    });
    expect(state.liveRevision).toBe(1);
  });

  proveOperation({
    operationId: 'production.change-admission.v1',
    declaration: changeAdmissionCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rolls back order and live revision when the event append fails',
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
            expectedVersion: 1,
            idempotencyKey: 'fixture-event',
            payload: {},
          });
          const before = await readState();
          const execute = makeExecute({
            idSource: generatedIds(ids.collision),
          });

          await expect(
            executeSerialized(execute, serializedCommand()),
          ).rejects.toMatchObject({
            code: 'production_admission_change_failed',
            status: 503,
          });
          expect(await readState()).toEqual(before);
        },
      },
    ],
  });

  it.each([
    {
      name: 'missing order',
      seed: { includeOrder: false } satisfies SeedOptions,
      request: { productionOrderId: ids.collision },
      code: 'production_order_not_found',
    },
    {
      name: 'stale version',
      seed: {} satisfies SeedOptions,
      request: { expectedVersion: 2 },
      code: 'production_order_version_conflict',
    },
    {
      name: 'withdrawn source admission',
      seed: { sourceAdmissionState: 'withdrawn' } satisfies SeedOptions,
      request: {},
      code: 'production_admission_source_withdrawn',
    },
    {
      name: 'archived production order',
      seed: {
        resolutionState: 'resolved_without_production',
      } satisfies SeedOptions,
      request: {},
      code: 'production_order_resolved',
    },
    {
      name: 'committed execution',
      seed: {
        operationalStatus: 'scheduled',
        executionStatus: 'scheduled',
        admissionOverride: 'released',
      } satisfies SeedOptions,
      request: { target: 'source' as const },
      code: 'production_admission_already_committed',
    },
  ])('returns $code for $name without a durable effect', async (scenario) => {
    await seed(scenario.seed);
    const before = await readState();
    const execute = makeExecute();

    await expect(
      executeSerialized(execute, serializedCommand(scenario.request)),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: scenario.code },
    });
    expect(await readState()).toEqual(before);
  });

  it('refuses source reversal after open-shift selection', async () => {
    await seed({
      operationalStatus: 'eligible',
      admissionOverride: 'released',
      version: 2,
    });
    await database.db.insert(productionTestSchema.productionShifts).values({
      id: ids.shift,
      locationId,
      startsAt: now,
      endsAt: new Date('2026-08-21T22:00:00.000Z'),
      timezone: 'America/New_York',
      status: 'open',
      effectiveFolderCount: 2,
    });
    await database.db
      .insert(productionTestSchema.productionShiftSelections)
      .values({
        productionShiftId: ids.shift,
        locationId,
        version: 1,
        selectedBy: ids.actor,
        selectedAt: now,
        updatedAt: now,
      });
    await database.db
      .insert(productionTestSchema.productionShiftSelectedOrders)
      .values({
        productionShiftId: ids.shift,
        locationId,
        productionOrderId: ids.productionOrder,
        selectedBy: ids.actor,
        selectedAt: now,
      });
    const before = await readState();

    await expect(
      executeSerialized(
        makeExecute(),
        serializedCommand({ target: 'source', expectedVersion: 2 }),
      ),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_admission_already_committed' },
    });
    expect(await readState()).toEqual(before);
  });

  proveOperation({
    operationId: 'production.change-admission.v1',
    declaration: changeAdmissionCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'collapses concurrent identical admission commands after the location lock',
        proves: ['same-key-concurrency'],
        run: async () => {
          await seed();
          const request = serializedCommand({ key: 'admission-same-key-race' });
          const outcomes = await Promise.all([
            executeSerialized(makeExecute(), request),
            executeSerialized(makeExecute(), request),
          ]);

          expect(
            outcomes.filter(
              (outcome) => (outcome as { kind?: string }).kind === 'success',
            ),
          ).toHaveLength(2);
          const state = await readState();
          expect(state.events).toHaveLength(1);
          expect(state.liveRevision).toBe(1);
          expect(state.order).toMatchObject({ version: 2 });
        },
      },
    ],
  });
});
