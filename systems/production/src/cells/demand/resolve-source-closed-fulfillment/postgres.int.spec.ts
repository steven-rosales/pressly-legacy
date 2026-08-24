import {
  productionTestSchema,
  seedProductionLocationTestFacts,
} from '../../../testing/production-schema.spec-support.ts';
import { proveOperation } from '@pressly/testkit/operation-proof';
import type { IdSource } from '@pressly/cells/id-source';
import {
  productionActorReadTestCapability,
  productionScopeReconciliationTestCapability,
} from '../../../testing/production-capabilities.spec-support.ts';
import { eq } from '@pressly/postgres/query';
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
import { resolveSourceClosedFulfillmentContract } from './contract.ts';
import { makeExecuteResolveSourceClosedFulfillment } from './execute.ts';
import { makeResolveSourceClosedFulfillmentPostgresRepository } from './postgres.ts';
import type { ExecuteResolveSourceClosedFulfillment } from './execute.ts';
import type {
  ResolveProductionOrderWithoutProduction,
  ResolveSourceClosedFulfillmentCommand,
} from './types.ts';
import { resolveSourceClosedFulfillmentCellDeclaration } from './cell.ts';
import { makeProductionSystem } from '../../../system.ts';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
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
  missingFulfillment: '18000000-0000-4000-8000-000000000099',
});
const businessId = '00000000-0000-4000-8000-000000000100';
const locationId = 'location-source-closed-resolution';
const createdAt = new Date('2026-08-21T12:00:00.000Z');
const dueAt = new Date('2026-08-22T20:00:00.000Z');

type SeedOptions = Readonly<{
  resolutionState?: 'open' | 'resolved_without_production';
  admissionState?: 'unreleased' | 'released' | 'withdrawn';
  commercialState?: 'open' | 'completed' | 'canceled';
}>;

const seed = async (options: SeedOptions = {}): Promise<void> => {
  const resolutionState = options.resolutionState ?? 'open';
  const admissionState = options.admissionState ?? 'unreleased';
  await seedProductionLocationTestFacts(database.db, [
    {
      id: locationId,
      businessId,
      name: 'Source Closed Resolution Facility',
      timezone: 'America/New_York',
    },
  ]);
  await database.db.insert(productionTestSchema.orderDemands).values({
    id: ids.demand,
    fulfillmentId: ids.fulfillment,
    fulfillmentVersion: 1,
    projectionHash: 'a'.repeat(64),
    admissionState,
    commercialState: options.commercialState ?? 'open',
    displayReference: 'SOURCE-CLOSED-1',
    locationId,
    revisionAt: createdAt,
    phase: 'expected',
    estimatedWeightLbs: 24,
    estimatedWeightSource: 'external_estimate',
    dueAt,
    createdAt,
    updatedAt: createdAt,
  });
  await database.db.insert(productionTestSchema.productionOrders).values({
    id: ids.productionOrder,
    orderDemandId: ids.demand,
    locationId,
    dueAt,
    operationalStatus: 'release_pending',
    executionStatus: 'unassigned',
    resolutionState,
    ...(resolutionState === 'resolved_without_production'
      ? {
          resolvedAt: createdAt,
          resolvedBy: ids.actor,
          resolutionReason: 'order_will_not_be_produced',
          resolutionNote: null,
        }
      : {}),
    derivedWeightLbs: 24,
    derivedWeightSource: 'external_estimate',
    version: 7,
    createdAt,
    updatedAt: createdAt,
  });
};

const command: ResolveSourceClosedFulfillmentCommand = {
  locationId,
  fulfillmentId: ids.fulfillment,
  actorId: ids.actor,
  idempotencyKey: 'source-close-resolution-1',
};

const makeIds = (): IdSource => {
  let next = 0;
  return {
    next: () => {
      next += 1;
      return `81000000-0000-4000-8000-${String(next).padStart(12, '0')}`;
    },
  };
};

const makeSystem = () =>
  makeProductionSystem({
    db: database.db,
    schema: productionTestSchema,
    productionActorReadV1: productionActorReadTestCapability(),
    productionScopeReconciliationV1:
      productionScopeReconciliationTestCapability(database.db),
    ids: makeIds(),
    clock: { now: () => new Date('2026-08-22T16:00:00.000Z') },
  });

const executeSerialized = async (
  execute: ExecuteResolveSourceClosedFulfillment,
  serialized: unknown,
): Promise<unknown> => {
  const decoded =
    resolveSourceClosedFulfillmentContract.input.decode(serialized);
  if (decoded.kind === 'invalid') return decoded;
  const outcome = await execute(decoded.value);
  return outcome.kind === 'success'
    ? {
        kind: 'success',
        value: resolveSourceClosedFulfillmentContract.output.encode(
          outcome.value,
        ),
      }
    : outcome;
};

describe('resolve source-closed fulfillment native Postgres candidate adapter', () => {
  it('loads the exact location-scoped projection by canonical fulfillment ID', async () => {
    await seed();
    const repo = makeResolveSourceClosedFulfillmentPostgresRepository(
      {
        db: database.db,
      },
      productionTestSchema,
    );
    await expect(
      repo.findCandidate(locationId, ids.fulfillment),
    ).resolves.toEqual({
      productionOrderId: ids.productionOrder,
      locationId,
      productionVersion: 7,
      resolutionState: 'open',
      sourceAdmissionState: 'unreleased',
      sourceCommercialState: 'open',
    });
    await expect(
      repo.findCandidate(locationId, ids.demand),
    ).resolves.toBeNull();
    await expect(
      repo.findCandidate('other-location', ids.fulfillment),
    ).resolves.toBeNull();
  });

  it('composes the real candidate read with exact delegated resolution input', async () => {
    await seed();
    const resolveProductionOrder =
      vi.fn<ResolveProductionOrderWithoutProduction>(async (input) => ({
        kind: 'success',
        value: {
          orderId: input.productionOrderId,
          version: input.expectedVersion + 1,
          replayed: false,
        },
      }));
    const execute = makeExecuteResolveSourceClosedFulfillment({
      repo: makeResolveSourceClosedFulfillmentPostgresRepository(
        {
          db: database.db,
        },
        productionTestSchema,
      ),
      resolveProductionOrder,
    });
    await expect(executeSerialized(execute, command)).resolves.toEqual({
      kind: 'success',
      value: {
        outcome: 'resolved',
        locationId,
        fulfillmentId: ids.fulfillment,
        productionOrderId: ids.productionOrder,
        version: 8,
        replayed: false,
      },
    });
    expect(resolveProductionOrder).toHaveBeenCalledWith({
      locationId,
      productionOrderId: ids.productionOrder,
      action: 'resolve_without_production',
      reason: 'order_will_not_be_produced',
      note: null,
      confirmReviewedFacts: false,
      sourceStatePrecondition: {
        commercialState: 'open',
        admissionState: 'unreleased',
      },
      expectedVersion: 7,
      idempotencyKey: command.idempotencyKey,
      actorId: ids.actor,
    });
    const [stored] = await database.db
      .select({ version: productionTestSchema.productionOrders.version })
      .from(productionTestSchema.productionOrders)
      .where(eq(productionTestSchema.productionOrders.id, ids.productionOrder));
    expect(stored).toEqual({ version: 7 });
  });

  it.each([
    {
      name: 'closed canonical work',
      seed: { commercialState: 'completed' as const },
      outcome: 'review_required',
      reason: 'canonical_order_not_open',
    },
    {
      name: 'released fulfillment',
      seed: { admissionState: 'released' as const },
      outcome: 'review_required',
      reason: 'fulfillment_not_unreleased',
    },
  ])('returns the exact $name no-op', async (scenario) => {
    await seed(scenario.seed);
    const resolveProductionOrder =
      vi.fn<ResolveProductionOrderWithoutProduction>();
    const execute = makeExecuteResolveSourceClosedFulfillment({
      repo: makeResolveSourceClosedFulfillmentPostgresRepository(
        {
          db: database.db,
        },
        productionTestSchema,
      ),
      resolveProductionOrder,
    });
    await expect(execute(command)).resolves.toMatchObject({
      kind: 'success',
      value: {
        outcome: scenario.outcome,
        ...(scenario.reason === undefined ? {} : { reason: scenario.reason }),
      },
    });
    expect(resolveProductionOrder).not.toHaveBeenCalled();
  });

  it('consults the authoritative receipt for already resolved work', async () => {
    await seed({ resolutionState: 'resolved_without_production' });
    const resolveProductionOrder =
      vi.fn<ResolveProductionOrderWithoutProduction>(async (input) => ({
        kind: 'success',
        value: {
          orderId: input.productionOrderId,
          version: 7,
          replayed: true,
        },
      }));
    const execute = makeExecuteResolveSourceClosedFulfillment({
      repo: makeResolveSourceClosedFulfillmentPostgresRepository(
        { db: database.db },
        productionTestSchema,
      ),
      resolveProductionOrder,
    });

    await expect(execute(command)).resolves.toEqual({
      kind: 'success',
      value: {
        outcome: 'resolved',
        locationId,
        fulfillmentId: ids.fulfillment,
        productionOrderId: ids.productionOrder,
        version: 7,
        replayed: true,
      },
    });
    expect(resolveProductionOrder).toHaveBeenCalledWith({
      locationId,
      productionOrderId: ids.productionOrder,
      action: 'resolve_without_production',
      reason: 'order_will_not_be_produced',
      note: null,
      confirmReviewedFacts: false,
      sourceStatePrecondition: {
        commercialState: 'open',
        admissionState: 'unreleased',
      },
      expectedVersion: 6,
      idempotencyKey: command.idempotencyKey,
      actorId: ids.actor,
    });
  });

  it('preserves historical already-resolved work when no delegated receipt exists', async () => {
    await seed({ resolutionState: 'resolved_without_production' });
    const execute = makeSystem().cells.resolveSourceClosedFulfillment.execute;

    await expect(execute(command)).resolves.toEqual({
      kind: 'success',
      value: {
        outcome: 'already_resolved',
        locationId,
        fulfillmentId: ids.fulfillment,
        productionOrderId: ids.productionOrder,
        version: 7,
      },
    });
    const [order] = await database.db
      .select({
        resolutionState: productionTestSchema.productionOrders.resolutionState,
        version: productionTestSchema.productionOrders.version,
      })
      .from(productionTestSchema.productionOrders)
      .where(eq(productionTestSchema.productionOrders.id, ids.productionOrder));
    expect(order).toEqual({
      resolutionState: 'resolved_without_production',
      version: 7,
    });
    await expect(
      database.db.select().from(productionTestSchema.workEvents),
    ).resolves.toEqual([]);
  });

  it('returns concurrent review when the order is restored between candidate read and receipt lookup', async () => {
    await seed({ resolutionState: 'resolved_without_production' });
    const system = makeSystem();
    const resolveProductionOrder: ResolveProductionOrderWithoutProduction =
      async (input) => {
        const restored = await system.cells.changeOrderResolution.execute({
          locationId,
          productionOrderId: ids.productionOrder,
          action: 'restore',
          reason: 'work_should_be_produced',
          note: null,
          expectedVersion: 7,
          idempotencyKey: 'restore-during-source-close-resolution',
          actorId: ids.actor,
        });
        expect(restored).toMatchObject({
          kind: 'success',
          value: { action: 'restore', version: 8 },
        });

        const resolution =
          await system.cells.changeOrderResolution.execute(input);
        return resolution.kind === 'success'
          ? {
              kind: 'success',
              value: {
                orderId: resolution.value.orderId,
                version: resolution.value.version,
                replayed: resolution.value.replayed,
              },
            }
          : {
              kind: 'failure',
              failure: { code: resolution.failure.code },
            };
      };
    const execute = makeExecuteResolveSourceClosedFulfillment({
      repo: makeResolveSourceClosedFulfillmentPostgresRepository(
        { db: database.db },
        productionTestSchema,
      ),
      resolveProductionOrder,
    });

    await expect(execute(command)).resolves.toEqual({
      kind: 'success',
      value: {
        outcome: 'review_required',
        locationId,
        fulfillmentId: ids.fulfillment,
        productionOrderId: ids.productionOrder,
        version: 8,
        reason: 'concurrent_change',
      },
    });
    const [order] = await database.db
      .select({
        resolutionState: productionTestSchema.productionOrders.resolutionState,
        version: productionTestSchema.productionOrders.version,
      })
      .from(productionTestSchema.productionOrders)
      .where(eq(productionTestSchema.productionOrders.id, ids.productionOrder));
    expect(order).toEqual({ resolutionState: 'open', version: 8 });
    await expect(
      database.db.select().from(productionTestSchema.workEvents),
    ).resolves.toHaveLength(1);
  });

  it('returns not-found without delegation when the projection is absent', async () => {
    const resolveProductionOrder =
      vi.fn<ResolveProductionOrderWithoutProduction>();
    const execute = makeExecuteResolveSourceClosedFulfillment({
      repo: makeResolveSourceClosedFulfillmentPostgresRepository(
        {
          db: database.db,
        },
        productionTestSchema,
      ),
      resolveProductionOrder,
    });
    await expect(
      execute({ ...command, fulfillmentId: ids.missingFulfillment }),
    ).resolves.toEqual({
      kind: 'success',
      value: {
        outcome: 'not_found',
        locationId,
        fulfillmentId: ids.missingFulfillment,
      },
    });
    expect(resolveProductionOrder).not.toHaveBeenCalled();
  });

  proveOperation({
    operationId: 'production.resolve-source-closed-fulfillment.v1',
    declaration: resolveSourceClosedFulfillmentCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'commits delegated resolution and returns the same durable replay',
        proves: ['postgres-commit', 'same-payload-replay'],
        run: async () => {
          await seed();
          const execute =
            makeSystem().cells.resolveSourceClosedFulfillment.execute;

          await expect(execute(command)).resolves.toMatchObject({
            kind: 'success',
            value: { outcome: 'resolved', version: 8, replayed: false },
          });
          await expect(execute(command)).resolves.toMatchObject({
            kind: 'success',
            value: { outcome: 'resolved', version: 8, replayed: true },
          });
          const [order] = await database.db
            .select({
              resolutionState:
                productionTestSchema.productionOrders.resolutionState,
              version: productionTestSchema.productionOrders.version,
            })
            .from(productionTestSchema.productionOrders)
            .where(
              eq(productionTestSchema.productionOrders.id, ids.productionOrder),
            );
          expect(order).toEqual({
            resolutionState: 'resolved_without_production',
            version: 8,
          });
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toHaveLength(1);
        },
      },
      {
        name: 'rejects divergent delegated identity without another Production write',
        proves: [
          'divergent-key-conflict',
          'expected-rejection-no-partial-write',
        ],
        run: async () => {
          await seed();
          const execute =
            makeSystem().cells.resolveSourceClosedFulfillment.execute;
          await expect(execute(command)).resolves.toMatchObject({
            kind: 'success',
            value: { outcome: 'resolved' },
          });
          const [before] = await database.db
            .select()
            .from(productionTestSchema.productionOrders)
            .where(
              eq(productionTestSchema.productionOrders.id, ids.productionOrder),
            );

          await expect(
            execute({
              ...command,
              actorId: '82000000-0000-4000-8000-000000000001',
            }),
          ).resolves.toMatchObject({
            kind: 'success',
            value: { outcome: 'review_required', reason: 'concurrent_change' },
          });
          const [after] = await database.db
            .select()
            .from(productionTestSchema.productionOrders)
            .where(
              eq(productionTestSchema.productionOrders.id, ids.productionOrder),
            );
          expect(after).toEqual(before);
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toHaveLength(1);
        },
      },
      {
        name: 'collapses concurrent identical source-close resolution through the delegated receipt',
        proves: ['same-key-concurrency'],
        run: async () => {
          await seed();
          const execute =
            makeSystem().cells.resolveSourceClosedFulfillment.execute;

          const outcomes = await Promise.all([
            execute(command),
            execute(command),
          ]);

          expect(outcomes.every(({ kind }) => kind === 'success')).toBe(true);
          expect(
            outcomes
              .flatMap((outcome) =>
                outcome.kind === 'success' &&
                outcome.value.outcome === 'resolved'
                  ? [outcome.value.replayed]
                  : [],
              )
              .sort(),
          ).toEqual([false, true]);
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toHaveLength(1);
        },
      },
      {
        name: 'leaves PostgreSQL untouched when candidate loading fails before delegation',
        proves: ['unexpected-failure-no-write'],
        run: async () => {
          await seed();
          const [before] = await database.db
            .select()
            .from(productionTestSchema.productionOrders)
            .where(
              eq(productionTestSchema.productionOrders.id, ids.productionOrder),
            );
          const resolveProductionOrder =
            vi.fn<ResolveProductionOrderWithoutProduction>();
          const execute = makeExecuteResolveSourceClosedFulfillment({
            repo: {
              findCandidate: async () =>
                Promise.reject({ fixture: 'candidate read unavailable' }),
            },
            resolveProductionOrder,
          });

          await expect(execute(command)).rejects.toMatchObject({
            code: 'production_source_closed_resolution_failed',
          });
          const [after] = await database.db
            .select()
            .from(productionTestSchema.productionOrders)
            .where(
              eq(productionTestSchema.productionOrders.id, ids.productionOrder),
            );
          expect(after).toEqual(before);
          expect(resolveProductionOrder).not.toHaveBeenCalled();
          await expect(
            database.db.select().from(productionTestSchema.workEvents),
          ).resolves.toHaveLength(0);
        },
      },
    ],
  });
});
