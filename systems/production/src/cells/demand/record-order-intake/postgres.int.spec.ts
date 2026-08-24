import { proveOperation } from '@pressly/testkit/operation-proof';
import { recordOrderIntakeCellDeclaration } from './cell.ts';
import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import { asc, eq } from '@pressly/postgres/query';
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
import { recordOrderIntakeContract } from './contract.ts';
import {
  makeExecuteRecordOrderIntake,
  type ExecuteRecordOrderIntake,
} from './execute.ts';
import { recordOrderIntakeIdempotency } from './idempotency.ts';
import { makeRecordOrderIntakePostgresRepository } from './postgres.ts';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
  tableNames: [
    'work_events',
    'production_bags',
    'production_orders',
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
  actor: '18000000-0000-4000-8000-000000000001',
  sourceOrder: '18000000-0000-4000-8000-000000000002',
  fulfillment: '18000000-0000-4000-8000-000000000003',
  demand: '18000000-0000-4000-8000-000000000004',
  productionOrder: '18000000-0000-4000-8000-000000000005',
  existingBags: [
    '18000000-0000-4000-8000-000000000011',
    '18000000-0000-4000-8000-000000000012',
  ],
  newBags: [
    '18000000-0000-4000-8000-000000000021',
    '18000000-0000-4000-8000-000000000022',
    '18000000-0000-4000-8000-000000000023',
  ],
  event: '18000000-0000-4000-8000-000000000031',
  collision: '18000000-0000-4000-8000-000000000032',
  missing: '18000000-0000-4000-8000-000000000099',
});

const locationId = 'location-record-intake';
const businessId = '00000000-0000-4000-8000-000000000100';
const now = new Date('2026-08-21T15:00:00.000Z');
const createdAt = new Date('2026-08-21T12:00:00.000Z');

type SeedOptions = Readonly<{
  includeOrder?: boolean;
  phase?:
    | 'expected'
    | 'inbound'
    | 'production_released'
    | 'post_production'
    | 'withdrawn';
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
  intakeVersion?: number;
  version?: number;
}>;

const seed = async (options: SeedOptions = {}): Promise<void> => {
  await database.db.insert(productionTestSchema.productionLocations).values({
    id: locationId,
    businessId,
    name: 'Record Intake Facility',
    timezone: 'America/New_York',
  });
  if (options.includeOrder === false) return;

  const dueAt = new Date('2026-08-22T20:00:00.000Z');
  const phase = options.phase ?? 'production_released';
  const admissionState =
    phase === 'production_released'
      ? 'released'
      : phase === 'withdrawn'
        ? 'withdrawn'
        : 'unreleased';
  const bagCount = options.bagCount === undefined ? null : options.bagCount;
  const intakeVersion = options.intakeVersion ?? (bagCount === null ? 0 : 1);
  const resolutionState = options.resolutionState ?? 'open';
  const admissionOverride = options.admissionOverride ?? null;
  const operationalStatus =
    options.operationalStatus ??
    (bagCount === null ? 'intake_pending' : 'eligible');

  await database.db.insert(productionTestSchema.orderDemands).values({
    id: ids.demand,
    fulfillmentId: ids.fulfillment,
    fulfillmentVersion: 1,
    projectionHash: 'a'.repeat(64),
    admissionState,
    commercialState: 'open',
    displayReference: 'INTAKE-1',
    locationId,
    revisionAt: createdAt,
    phase,
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
    operationalStatus,
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
    intakeVersion,
    admissionOverride,
    admissionOverrideAt: admissionOverride === null ? null : createdAt,
    admissionOverrideBy: admissionOverride === null ? null : ids.actor,
    eligibleAt: operationalStatus === 'eligible' ? createdAt : null,
    version: options.version ?? 1,
    createdAt,
    updatedAt: createdAt,
  });
  if (bagCount !== null && bagCount > 0)
    await database.db.insert(productionTestSchema.bags).values(
      Array.from({ length: bagCount }, (_, bagIndex) => ({
        id:
          ids.existingBags[bagIndex] ??
          `18000000-0000-4000-8000-${String(100 + bagIndex).padStart(12, '0')}`,
        productionOrderId: ids.productionOrder,
        bagIndex,
        status: 'eligible',
      })),
    );
};

const idSource = (values: readonly string[]): IdSource => {
  let index = 0;
  return {
    next: () =>
      values[index++] ??
      `28000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  };
};

const makeExecute = (
  input: {
    ids?: IdSource;
    observeUnitOfWork?: Parameters<
      typeof makeRecordOrderIntakePostgresRepository
    >[0]['observeUnitOfWork'];
  } = {},
) =>
  makeExecuteRecordOrderIntake({
    repo: makeRecordOrderIntakePostgresRepository(
      {
        db: database.db,
        ids: input.ids ?? idSource([...ids.newBags, ids.event]),
        ...(input.observeUnitOfWork === undefined
          ? {}
          : { observeUnitOfWork: input.observeUnitOfWork }),
      },
      productionTestSchema,
    ),
    idempotency: recordOrderIntakeIdempotency,
    policy: productionRules,
    clock: { now: () => now },
  });

const serializedCommand = (
  input: {
    bagCount?: number;
    expectedVersion?: number;
    key?: string;
    productionOrderId?: string;
  } = {},
) => ({
  body: {
    bagCount: input.bagCount ?? 3,
    expectedVersion: input.expectedVersion ?? 1,
    idempotencyKey: input.key ?? 'record-intake-command-1',
  },
  params: {
    locationId,
    productionOrderId: input.productionOrderId ?? ids.productionOrder,
  },
  actorId: ids.actor,
});

const executeSerialized = async (
  execute: ExecuteRecordOrderIntake,
  serialized: ReturnType<typeof serializedCommand>,
): Promise<unknown> => {
  const decoded = recordOrderIntakeContract.input.decode(serialized);
  if (decoded.kind === 'invalid') return decoded;
  const outcome = await execute(decoded.value);
  return outcome.kind === 'success'
    ? {
        kind: 'success',
        value: recordOrderIntakeContract.output.encode(outcome.value),
      }
    : {
        kind: 'failure',
        failure: recordOrderIntakeContract.failure.encode(outcome.failure),
      };
};

const readState = async () => {
  const [order] = await database.db
    .select({
      bagCount: productionTestSchema.productionOrders.bagCount,
      bagCountSource: productionTestSchema.productionOrders.bagCountSource,
      intakeRecordedAt: productionTestSchema.productionOrders.intakeRecordedAt,
      intakeVersion: productionTestSchema.productionOrders.intakeVersion,
      status: productionTestSchema.productionOrders.operationalStatus,
      eligibleAt: productionTestSchema.productionOrders.eligibleAt,
      version: productionTestSchema.productionOrders.version,
      updatedAt: productionTestSchema.productionOrders.updatedAt,
    })
    .from(productionTestSchema.productionOrders)
    .where(eq(productionTestSchema.productionOrders.id, ids.productionOrder));
  const bags = await database.db
    .select({
      id: productionTestSchema.bags.id,
      bagIndex: productionTestSchema.bags.bagIndex,
      status: productionTestSchema.bags.status,
    })
    .from(productionTestSchema.bags)
    .orderBy(asc(productionTestSchema.bags.bagIndex));
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
    bags,
    events,
    liveRevision: location?.revision ?? -1,
  };
};

describe('record order intake serialized native Postgres cell', () => {
  proveOperation({
    operationId: 'production.record-order-intake.v1',
    declaration: recordOrderIntakeCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'commits exact bags and receipt once, replays, and rejects divergent reuse',
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
              bagCount: 3,
              bagCountProvenance: 'operator_intake',
              intakeVersion: 1,
              version: 2,
              replayed: false,
            },
          });
          await expect(
            executeSerialized(execute, request),
          ).resolves.toMatchObject({
            kind: 'success',
            value: { intakeVersion: 1, version: 2, replayed: true },
          });
          await expect(
            executeSerialized(execute, serializedCommand({ bagCount: 2 })),
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
            bagCount: 3,
            bagCountSource: 'operator_intake',
            intakeRecordedAt: now,
            intakeVersion: 1,
            status: 'eligible',
            eligibleAt: now,
            version: 2,
            updatedAt: now,
          });
          expect(state.bags).toEqual(
            ids.newBags.map((id, bagIndex) => ({
              id,
              bagIndex,
              status: 'eligible',
            })),
          );
          expect(state.events).toEqual([
            {
              id: ids.event,
              eventType: 'production_order_intake_recorded',
              entityType: 'production_order',
              entityId: ids.productionOrder,
              actorId: ids.actor,
              expectedVersion: 1,
              idempotencyKey: 'record-intake-command-1',
              payload: {
                bagCount: 3,
                bagCountProvenance: 'operator_intake',
                intakeVersion: 1,
                version: 2,
                _idempotency: {
                  version: 1,
                  command: {
                    operation: 'production_order_intake_recorded',
                    locationId,
                    actorId: ids.actor,
                    target: {
                      entityType: 'production_order',
                      entityId: ids.productionOrder,
                    },
                    expectedVersion: 1,
                    payload: { bagCount: 3 },
                  },
                  result: {
                    locationId,
                    orderId: ids.productionOrder,
                    bagCount: 3,
                    bagCountProvenance: 'operator_intake',
                    intakeVersion: 1,
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

  it('accepts authoritative zero-bag correction and increments both versions', async () => {
    await seed({
      bagCount: 2,
      intakeVersion: 1,
      operationalStatus: 'eligible',
      version: 4,
    });
    await expect(
      executeSerialized(
        makeExecute({ ids: idSource([ids.event]) }),
        serializedCommand({ bagCount: 0, expectedVersion: 4 }),
      ),
    ).resolves.toMatchObject({
      kind: 'success',
      value: { bagCount: 0, intakeVersion: 2, version: 5 },
    });
    const state = await readState();
    expect(state.bags).toEqual([]);
    expect(state.order).toMatchObject({
      bagCount: 0,
      intakeVersion: 2,
      version: 5,
    });
  });

  proveOperation({
    operationId: 'production.record-order-intake.v1',
    declaration: recordOrderIntakeCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'serializes same-version intake writes so one mutation wins',
        proves: ['declared-concurrency-race'],
        run: async () => {
          await seed();
          const outcomes = await Promise.all([
            executeSerialized(
              makeExecute({
                ids: idSource([
                  '38000000-0000-4000-8000-000000000001',
                  '38000000-0000-4000-8000-000000000002',
                  '38000000-0000-4000-8000-000000000003',
                ]),
              }),
              serializedCommand({ bagCount: 2, key: 'intake-race-1' }),
            ),
            executeSerialized(
              makeExecute({
                ids: idSource([
                  '48000000-0000-4000-8000-000000000001',
                  '48000000-0000-4000-8000-000000000002',
                  '48000000-0000-4000-8000-000000000003',
                  '48000000-0000-4000-8000-000000000004',
                ]),
              }),
              serializedCommand({ bagCount: 3, key: 'intake-race-2' }),
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
          expect(state.order).toMatchObject({ intakeVersion: 1, version: 2 });
          expect(state.events).toHaveLength(1);
          expect(state.liveRevision).toBe(1);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.record-order-intake.v1',
    declaration: recordOrderIntakeCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rolls back order, bags, receipt, and live revision after late append failure',
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
            ids: idSource([...ids.newBags, ids.collision]),
          });

          await expect(
            executeSerialized(execute, serializedCommand()),
          ).rejects.toMatchObject({
            code: 'production_intake_failed',
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
      name: 'archived order',
      seed: {
        resolutionState: 'resolved_without_production',
      } satisfies SeedOptions,
      request: {},
      code: 'production_order_resolved',
    },
    {
      name: 'scheduled order',
      seed: {
        operationalStatus: 'scheduled',
        executionStatus: 'scheduled',
      } satisfies SeedOptions,
      request: {},
      code: 'production_order_intake_state_invalid',
    },
    {
      name: 'withdrawn demand',
      seed: { phase: 'withdrawn' } satisfies SeedOptions,
      request: {},
      code: 'order_demand_withdrawn',
    },
    {
      name: 'post-production demand',
      seed: { phase: 'post_production' } satisfies SeedOptions,
      request: {},
      code: 'order_source_already_post_production',
    },
  ])('returns $code for $name without a durable effect', async (scenario) => {
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

  it.each([
    {
      name: 'unreleased demand remains release pending',
      seed: { phase: 'expected' } satisfies SeedOptions,
      status: 'release_pending',
    },
    {
      name: 'manager override admits unreleased demand',
      seed: {
        phase: 'expected',
        admissionOverride: 'released',
      } satisfies SeedOptions,
      status: 'eligible',
    },
  ])('$name', async (scenario) => {
    await seed(scenario.seed);
    await expect(
      executeSerialized(makeExecute(), serializedCommand()),
    ).resolves.toMatchObject({ kind: 'success' });
    expect((await readState()).order).toMatchObject({
      status: scenario.status,
      intakeVersion: 1,
      version: 2,
    });
  });

  proveOperation({
    operationId: 'production.record-order-intake.v1',
    declaration: recordOrderIntakeCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'collapses concurrent identical intake commands to one bag graph',
        proves: ['same-key-concurrency'],
        run: async () => {
          await seed();
          const request = serializedCommand({ key: 'intake-same-key-race' });
          const outcomes = await Promise.all([
            executeSerialized(
              makeExecute({
                ids: idSource([
                  '58000000-0000-4000-8000-000000000001',
                  '58000000-0000-4000-8000-000000000002',
                  '58000000-0000-4000-8000-000000000003',
                  '58000000-0000-4000-8000-000000000004',
                ]),
              }),
              request,
            ),
            executeSerialized(
              makeExecute({
                ids: idSource([
                  '68000000-0000-4000-8000-000000000001',
                  '68000000-0000-4000-8000-000000000002',
                  '68000000-0000-4000-8000-000000000003',
                  '68000000-0000-4000-8000-000000000004',
                ]),
              }),
              request,
            ),
          ]);

          expect(
            outcomes.filter(
              (outcome) => (outcome as { kind?: string }).kind === 'success',
            ),
          ).toHaveLength(2);
          const state = await readState();
          expect(state.bags).toHaveLength(3);
          expect(state.events).toHaveLength(1);
          expect(state.order).toMatchObject({ intakeVersion: 1, version: 2 });
        },
      },
    ],
  });
});
