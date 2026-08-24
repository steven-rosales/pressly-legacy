import { proveOperation } from '@pressly/testkit/operation-proof';
import { commitOrderBacklogCellDeclaration } from './cell.ts';
import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import type { JsonObject } from '@pressly/codec';
import { asc, eq } from '@pressly/postgres/query';
import { invariantViolationError } from '@pressly/errors/factories';
import type { IdSource } from '@pressly/cells/id-source';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { productionOrderBacklogCursor } from '../../../read-models/production-order-backlog/cursor.ts';
import type { ProductionOrderBacklogScope } from '../../../read-models/production-order-backlog/model.ts';
import { makeProductionOrderBacklogSnapshotReader } from '../../../read-models/production-order-backlog/postgres.ts';
import {
  classifyProductionOrderBacklogSnapshot,
  hashProductionOrderBacklogPreview,
} from '../../../read-models/production-order-backlog/project.ts';
import {
  makeExecuteCommitOrderBacklog,
  type CommitOrderBacklogRepository,
  type ExecuteCommitOrderBacklog,
} from './execute.ts';
import {
  commitOrderBacklogIdempotency,
  type StoredCommitOrderBacklogWorkEvent,
} from './idempotency.ts';
import { makeCommitOrderBacklogPostgresRepository } from './postgres.ts';
import type { CommitOrderBacklogCommand } from './types.ts';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
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
    'production_stations',
    'production_orders',
    'order_demands',
    'production_shifts',
    'production_locations',
  ],
  maxConnections: 8,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : { resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'] }),
});

beforeAll(database.check);
beforeEach(database.reset);
afterAll(database.close);

const uuid = (prefix: number, suffix: number): string =>
  `${String(prefix).padStart(8, '0')}-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const businessId = '00000000-0000-4000-8000-000000000100';
const locationId = 'location-commit-order-backlog';
const actorId = uuid(76000000, 1);
const now = new Date('2026-08-22T16:00:00.000Z');
const cutoff = '2026-08-01T00:00:00.000Z';
const baseDueAt = new Date('2026-07-01T12:00:00.000Z');

type SeedOrder = Readonly<{
  suffix: number;
  dueAt?: Date;
  version?: number;
  resolutionState?: 'open' | 'resolved_without_production';
  executionStatus?: 'unassigned' | 'scheduled' | 'finished';
  operationalStatus?:
    | 'release_pending'
    | 'intake_pending'
    | 'eligible'
    | 'ineligible'
    | 'scheduled'
    | 'finished';
  intake?: boolean;
  manualAdmission?: boolean;
  priority?: boolean;
  pendingPlacement?: boolean;
}>;

const productionOrderId = (suffix: number) => uuid(76000000, 100 + suffix);

const seedLocation = async (): Promise<void> => {
  await database.db.insert(productionTestSchema.productionLocations).values({
    id: locationId,
    businessId,
    name: 'Commit Order Backlog Facility',
    timezone: 'America/New_York',
  });
};

const seedOrder = async (input: SeedOrder): Promise<string> => {
  const fulfillmentId = uuid(76200000, input.suffix);
  const demandId = uuid(76300000, input.suffix);
  const orderId = productionOrderId(input.suffix);
  const dueAt = input.dueAt ?? baseDueAt;
  const intake = input.intake ?? false;
  const resolutionState = input.resolutionState ?? 'open';
  await database.db.insert(productionTestSchema.orderDemands).values({
    id: demandId,
    fulfillmentId,
    fulfillmentVersion: 1,
    projectionHash: 'a'.repeat(64),
    admissionState: 'unreleased',
    commercialState: 'open',
    displayReference: `BACKLOG-${input.suffix}`,
    locationId,
    revisionAt: dueAt,
    phase: 'expected',
    estimatedWeightLbs: 20,
    estimatedWeightSource: 'test',
    dueAt,
  });
  await database.db.insert(productionTestSchema.productionOrders).values({
    id: orderId,
    orderDemandId: demandId,
    locationId,
    dueAt,
    priority: input.priority ?? false,
    operationalStatus: input.operationalStatus ?? 'release_pending',
    executionStatus: input.executionStatus ?? 'unassigned',
    resolutionState,
    ...(resolutionState === 'resolved_without_production'
      ? {
          resolvedAt: now,
          resolvedBy: actorId,
          resolutionReason: 'processor_not_in_use' as const,
        }
      : {}),
    derivedWeightLbs: 20,
    bagCount: intake ? 1 : null,
    bagCountSource: intake ? 'operator_intake' : null,
    intakeRecordedAt: intake ? now : null,
    intakeVersion: intake ? 1 : 0,
    admissionOverride: input.manualAdmission ? 'released' : null,
    admissionOverrideAt: input.manualAdmission ? now : null,
    admissionOverrideBy: input.manualAdmission ? actorId : null,
    pendingPlacement: input.pendingPlacement ? { fixture: 'pending' } : null,
    version: input.version ?? 1,
  });
  return orderId;
};

const seed = async (ordersToSeed: readonly SeedOrder[]): Promise<string[]> => {
  await seedLocation();
  const ids: string[] = [];
  for (const candidate of ordersToSeed) ids.push(await seedOrder(candidate));
  return ids;
};

const scope = (
  overrides: Partial<ProductionOrderBacklogScope> = {},
): ProductionOrderBacklogScope => ({
  locationId,
  filter: 'all_due_before_cutoff',
  cutoff,
  reason: 'processor_not_in_use',
  cursor: null,
  maxOrders: 250,
  ...overrides,
});

const reviewedCommand = async (
  overrides: Partial<CommitOrderBacklogCommand> = {},
): Promise<CommitOrderBacklogCommand> => {
  const reviewScope = scope(overrides);
  const decoded = productionOrderBacklogCursor.decode(
    reviewScope.cursor,
    reviewScope,
  );
  if (decoded.kind === 'invalid')
    throw invariantViolationError({
      code: 'commit_order_backlog_test_cursor_invalid',
      message: decoded.failure.message,
    });
  const snapshot = await makeProductionOrderBacklogSnapshotReader(
    database.db,
    productionTestSchema,
  )({
    locationId: reviewScope.locationId,
    filter: reviewScope.filter,
    cutoff: new Date(reviewScope.cutoff),
    maxOrders: reviewScope.maxOrders,
    after: decoded.point,
  });
  const classified = classifyProductionOrderBacklogSnapshot(
    productionRules,
    snapshot,
  );
  return {
    ...reviewScope,
    actorId,
    note: null,
    previewHash: hashProductionOrderBacklogPreview(reviewScope, classified),
    idempotencyKey: 'commit-order-backlog-postgres-1',
    ...overrides,
  };
};

const idSource = (...fixed: string[]): IdSource => {
  let index = 0;
  return {
    next: () => fixed[index++] ?? uuid(76900000, 1000 + index),
  };
};

const makeExecute = (input: {
  ids: IdSource;
  transformRepository?: (
    repository: CommitOrderBacklogRepository<StoredCommitOrderBacklogWorkEvent>,
  ) => CommitOrderBacklogRepository<StoredCommitOrderBacklogWorkEvent>;
}): ExecuteCommitOrderBacklog => {
  const native = makeCommitOrderBacklogPostgresRepository(
    {
      db: database.db,
      ids: input.ids,
    },
    productionTestSchema,
  );
  return makeExecuteCommitOrderBacklog({
    repo: input.transformRepository?.(native) ?? native,
    idempotency: commitOrderBacklogIdempotency,
    policy: productionRules,
    clock: { now: () => now },
    ids: input.ids,
  });
};

const state = async () => {
  const [orderRows, events, locationRows] = await Promise.all([
    database.db
      .select({
        id: productionTestSchema.productionOrders.id,
        resolutionState: productionTestSchema.productionOrders.resolutionState,
        resolvedAt: productionTestSchema.productionOrders.resolvedAt,
        resolvedBy: productionTestSchema.productionOrders.resolvedBy,
        resolutionReason:
          productionTestSchema.productionOrders.resolutionReason,
        resolutionNote: productionTestSchema.productionOrders.resolutionNote,
        bulkOperationId:
          productionTestSchema.productionOrders.resolutionBulkOperationId,
        version: productionTestSchema.productionOrders.version,
      })
      .from(productionTestSchema.productionOrders)
      .orderBy(asc(productionTestSchema.productionOrders.id)),
    database.db
      .select({
        id: productionTestSchema.workEvents.id,
        eventType: productionTestSchema.workEvents.eventType,
        entityId: productionTestSchema.workEvents.entityId,
        expectedVersion: productionTestSchema.workEvents.expectedVersion,
        idempotencyKey: productionTestSchema.workEvents.idempotencyKey,
        payload: productionTestSchema.workEvents.payload,
      })
      .from(productionTestSchema.workEvents)
      .orderBy(
        asc(productionTestSchema.workEvents.createdAt),
        asc(productionTestSchema.workEvents.id),
      ),
    database.db
      .select({
        revision: productionTestSchema.productionLocations.liveRevision,
      })
      .from(productionTestSchema.productionLocations)
      .where(eq(productionTestSchema.productionLocations.id, locationId)),
  ]);
  return {
    orders: orderRows,
    events,
    liveRevision: locationRows[0]?.revision ?? -1,
  };
};

const firstReadBarrier = () => {
  let arrivals = 0;
  let release: (() => void) | undefined;
  const bothArrived = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    wait: async () => {
      arrivals += 1;
      if (arrivals === 2) release?.();
      await bothArrived;
    },
    arrivals: () => arrivals,
  };
};

const gateFirstReplayReads = (barrier: ReturnType<typeof firstReadBarrier>) => {
  let reads = 0;
  return (
    native: CommitOrderBacklogRepository<StoredCommitOrderBacklogWorkEvent>,
  ): CommitOrderBacklogRepository<StoredCommitOrderBacklogWorkEvent> => ({
    transaction: (work) =>
      native.transaction((repository) =>
        work({
          ...repository,
          findWorkEvent: async (key) => {
            const stored = await repository.findWorkEvent(key);
            if (reads++ < 2) await barrier.wait();
            return stored;
          },
        }),
      ),
  });
};

describe('commit order backlog native PostgreSQL command', () => {
  proveOperation({
    operationId: 'production.commit-order-backlog.v1',
    declaration: commitOrderBacklogCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'commits ready orders in dueAt/id order with exact events, receipt, revision,',
        proves: ['postgres-commit'],
        run: async () => {
          const [readyA, readyB, review] = await seed([
            { suffix: 2 },
            { suffix: 1 },
            { suffix: 3, intake: true, priority: true },
          ]);
          const command = await reviewedCommand({
            note: 'Manager reviewed old Production work.',
          });
          const bulkId = uuid(76400000, 1);
          const orderEventA = uuid(76400000, 2);
          const orderEventB = uuid(76400000, 3);
          const receiptId = uuid(76400000, 4);
          const generatedIds = idSource(
            bulkId,
            orderEventA,
            orderEventB,
            receiptId,
          );
          const resolvedOrderIds: string[] = [];
          const native = makeCommitOrderBacklogPostgresRepository(
            {
              db: database.db,
              ids: generatedIds,
            },
            productionTestSchema,
          );
          const repo: CommitOrderBacklogRepository<StoredCommitOrderBacklogWorkEvent> =
            {
              transaction: (work) =>
                native.transaction((repository) =>
                  work({
                    ...repository,
                    resolveOrder: (input) => {
                      resolvedOrderIds.push(input.orderId);
                      return repository.resolveOrder(input);
                    },
                  }),
                ),
            };
          const outcome = await makeExecuteCommitOrderBacklog({
            repo,
            idempotency: commitOrderBacklogIdempotency,
            policy: productionRules,
            clock: { now: () => now },
            ids: generatedIds,
          })(command);

          expect(outcome).toMatchObject({
            kind: 'success',
            value: {
              bulkOperationId: bulkId,
              resolvedCount: 2,
              resolved: [
                { orderId: readyB, version: 2 },
                { orderId: readyA, version: 2 },
              ],
              committedAt: now.toISOString(),
              replayed: false,
            },
          });
          expect(resolvedOrderIds).toEqual([readyB, readyA]);
          const after = await state();
          expect(after.orders).toEqual([
            expect.objectContaining({
              id: readyB,
              resolutionState: 'resolved_without_production',
              resolvedAt: now,
              resolvedBy: actorId,
              resolutionReason: 'processor_not_in_use',
              resolutionNote: command.note,
              bulkOperationId: bulkId,
              version: 2,
            }),
            expect.objectContaining({
              id: readyA,
              resolutionState: 'resolved_without_production',
              bulkOperationId: bulkId,
              version: 2,
            }),
            expect.objectContaining({ id: review, resolutionState: 'open' }),
          ]);
          expect(after.events.map(({ eventType }) => eventType)).toEqual([
            'production_order_bulk_resolved_without_production',
            'production_order_bulk_resolved_without_production',
            'production_order_backlog_bulk_resolution_committed',
          ]);
          expect(after.events[0]).toMatchObject({
            entityId: readyB,
            expectedVersion: 1,
            payload: {
              bulkOperationId: bulkId,
              previewHash: command.previewHash,
              from: 'open',
              resolutionState: 'resolved_without_production',
              reason: command.reason,
              version: 2,
              _idempotency: {
                version: 1,
                command: {
                  operation:
                    'production_order_bulk_resolved_without_production',
                  target: { entityType: 'production_order', entityId: readyB },
                  expectedVersion: 1,
                },
                result: {
                  bulkOperationId: bulkId,
                  orderId: readyB,
                  resolutionState: 'resolved_without_production',
                  version: 2,
                },
              },
            },
          });
          expect(after.events[0]?.payload as JsonObject).not.toHaveProperty(
            'note',
          );
          expect(after.events[2]).toMatchObject({
            id: receiptId,
            idempotencyKey: command.idempotencyKey,
            payload: {
              candidateCount: 3,
              resolvedCount: 2,
              _idempotency: {
                version: 1,
                command: {
                  operation: 'production_order_backlog_bulk_resolution',
                  target: {
                    entityType: 'production_order_bulk_resolution',
                    entityId: null,
                  },
                  expectedVersion: null,
                },
                result: {
                  locationId,
                  bulkOperationId: bulkId,
                  resolvedCount: 2,
                  replayed: false,
                },
              },
            },
          });
          expect(after.liveRevision).toBe(3);
        },
      },
    ],
  });

  it('commits an aggregate-only no-op for review and historical rows', async () => {
    const [review, historical] = await seed([
      { suffix: 1, intake: true },
      { suffix: 2, resolutionState: 'resolved_without_production' },
    ]);
    const command = await reviewedCommand();
    const outcome = await makeExecute({
      ids: idSource(uuid(76500000, 1), uuid(76500000, 2)),
    })(command);
    expect(outcome).toMatchObject({
      kind: 'success',
      value: { resolvedCount: 0, resolved: [], replayed: false },
    });
    const after = await state();
    expect(after.orders).toEqual([
      expect.objectContaining({ id: review, resolutionState: 'open' }),
      expect.objectContaining({
        id: historical,
        resolutionState: 'resolved_without_production',
      }),
    ]);
    expect(after.events).toHaveLength(1);
    expect(after.events[0]?.eventType).toBe(
      'production_order_backlog_bulk_resolution_committed',
    );
    expect(after.liveRevision).toBe(1);
  });

  proveOperation({
    operationId: 'production.commit-order-backlog.v1',
    declaration: commitOrderBacklogCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'replays the exact receipt and rejects divergent reuse without another revision',
        proves: [
          'same-payload-replay',
          'divergent-key-conflict',
          'expected-rejection-no-partial-write',
        ],
        run: async () => {
          await seed([{ suffix: 1 }]);
          const command = await reviewedCommand();
          const execute = makeExecute({
            ids: idSource(
              uuid(76600000, 1),
              uuid(76600000, 2),
              uuid(76600000, 3),
            ),
          });
          const first = await execute(command);
          const second = await execute(command);
          const divergent = await execute({
            ...command,
            note: 'Different request',
          });
          expect(first).toMatchObject({
            kind: 'success',
            value: { replayed: false },
          });
          expect(second).toMatchObject({
            kind: 'success',
            value: { replayed: true },
          });
          expect(divergent).toMatchObject({
            kind: 'failure',
            failure: { code: 'production_idempotency_conflict' },
          });
          expect((await state()).liveRevision).toBe(2);
          expect((await state()).events).toHaveLength(2);
        },
      },
    ],
  });

  it('paginates the bounded locked snapshot with exact cursor bytes and UUID ordering', async () => {
    const [firstId, secondId, thirdId] = await seed([
      { suffix: 1 },
      { suffix: 2 },
      { suffix: 3 },
    ]);
    const command = await reviewedCommand({ maxOrders: 2 });
    const outcome = await makeExecute({
      ids: idSource(
        uuid(76700000, 1),
        uuid(76700000, 2),
        uuid(76700000, 3),
        uuid(76700000, 4),
      ),
    })(command);
    expect(outcome).toMatchObject({
      kind: 'success',
      value: {
        resolved: [{ orderId: firstId }, { orderId: secondId }],
        resolvedCount: 2,
        nextCursor: expect.any(String),
      },
    });
    if (outcome.kind !== 'success' || outcome.value.nextCursor === null) return;
    expect(
      productionOrderBacklogCursor.decode(outcome.value.nextCursor, command),
    ).toEqual({
      kind: 'valid',
      point: { dueAt: baseDueAt, orderId: secondId },
    });
    const second = await reviewedCommand({
      cursor: outcome.value.nextCursor,
      maxOrders: 2,
      idempotencyKey: 'commit-order-backlog-page-2',
    });
    expect(second.previewHash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      (await state()).orders.find(({ id }) => id === thirdId),
    ).toMatchObject({
      resolutionState: 'open',
    });
  });

  it('rejects a stale preview hash before any order, event, or revision mutation', async () => {
    await seed([{ suffix: 1 }]);
    const command = await reviewedCommand();
    await database.db
      .update(productionTestSchema.productionOrders)
      .set({ version: 2 })
      .where(
        eq(productionTestSchema.productionOrders.id, productionOrderId(1)),
      );
    const before = await state();
    const outcome = await makeExecute({
      ids: idSource(uuid(76800000, 1)),
    })(command);
    expect(outcome).toMatchObject({
      kind: 'failure',
      failure: { code: 'production_order_backlog_preview_stale' },
    });
    expect(await state()).toEqual(before);
  });

  proveOperation({
    operationId: 'production.commit-order-backlog.v1',
    declaration: commitOrderBacklogCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'serializes identical and different-key same-version races at the location lock',
        proves: ['same-key-concurrency', 'declared-concurrency-race'],
        run: async () => {
          await seed([{ suffix: 1 }]);
          const command = await reviewedCommand();
          const replayBarrier = firstReadBarrier();
          const replayGate = gateFirstReplayReads(replayBarrier);
          const identical = await Promise.all([
            makeExecute({
              ids: idSource(
                uuid(77000000, 1),
                uuid(77000000, 2),
                uuid(77000000, 3),
              ),
              transformRepository: replayGate,
            })(command),
            makeExecute({
              ids: idSource(
                uuid(77000000, 4),
                uuid(77000000, 5),
                uuid(77000000, 6),
              ),
              transformRepository: replayGate,
            })(command),
          ]);
          expect(replayBarrier.arrivals()).toBe(2);
          expect(identical).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                kind: 'success',
                value: expect.objectContaining({ replayed: false }),
              }),
              expect.objectContaining({
                kind: 'success',
                value: expect.objectContaining({ replayed: true }),
              }),
            ]),
          );

          await database.reset();
          await seed([{ suffix: 1 }]);
          const raced = await reviewedCommand();
          const versionBarrier = firstReadBarrier();
          const versionGate = gateFirstReplayReads(versionBarrier);
          const different = await Promise.all([
            makeExecute({
              ids: idSource(
                uuid(77100000, 1),
                uuid(77100000, 2),
                uuid(77100000, 3),
              ),
              transformRepository: versionGate,
            })({ ...raced, idempotencyKey: 'commit-backlog-race-a' }),
            makeExecute({
              ids: idSource(
                uuid(77100000, 4),
                uuid(77100000, 5),
                uuid(77100000, 6),
              ),
              transformRepository: versionGate,
            })({ ...raced, idempotencyKey: 'commit-backlog-race-b' }),
          ]);
          expect(versionBarrier.arrivals()).toBe(2);
          expect(
            different.filter(({ kind }) => kind === 'success'),
          ).toHaveLength(1);
          expect(different).toContainEqual(
            expect.objectContaining({
              kind: 'failure',
              failure: expect.objectContaining({
                code: 'production_order_backlog_preview_stale',
              }),
            }),
          );
          expect((await state()).events).toHaveLength(2);
          expect((await state()).liveRevision).toBe(2);
        },
      },
    ],
  });

  proveOperation({
    operationId: 'production.commit-order-backlog.v1',
    declaration: commitOrderBacklogCellDeclaration,
    layer: 'postgres',
    scenarios: [
      {
        name: 'rolls back every order when a late per-order CAS loses',
        proves: ['unexpected-failure-rollback'],
        run: async () => {
          await seed([{ suffix: 1 }, { suffix: 2 }]);
          const command = await reviewedCommand();
          const before = await state();
          const outcome = await makeExecute({
            ids: idSource(uuid(77200000, 1), uuid(77200000, 2)),
            transformRepository: (native) => ({
              transaction: (work) =>
                native.transaction((repository) => {
                  let calls = 0;
                  return work({
                    ...repository,
                    resolveOrder: (input) =>
                      repository.resolveOrder(
                        calls++ === 0
                          ? input
                          : {
                              ...input,
                              expectedVersion: input.expectedVersion + 1,
                            },
                      ),
                  });
                }),
            }),
          })(command);
          expect(outcome).toMatchObject({
            kind: 'failure',
            failure: { code: 'production_order_backlog_commit_conflict' },
          });
          expect(await state()).toEqual(before);
        },
      },
    ],
  });

  it('rolls back the order and revision when a per-order event append fails', async () => {
    await seed([{ suffix: 1 }]);
    const collision = uuid(77300000, 2);
    await database.db.insert(productionTestSchema.workEvents).values({
      id: collision,
      locationId,
      eventType: 'fixture',
      entityType: 'fixture',
      entityId: collision,
      actorId,
      expectedVersion: null,
      idempotencyKey: 'fixture-per-order-collision',
      payload: {},
    });
    const command = await reviewedCommand();
    const before = await state();
    await expect(
      makeExecute({
        ids: idSource(uuid(77300000, 1), collision),
      })(command),
    ).rejects.toMatchObject({
      code: 'production_order_backlog_commit_failed',
      status: 503,
    });
    expect(await state()).toEqual(before);
  });

  it('rolls back orders, per-order events, receipt, and revision when aggregate append fails', async () => {
    await seed([{ suffix: 1 }]);
    const collision = uuid(77400000, 3);
    await database.db.insert(productionTestSchema.workEvents).values({
      id: collision,
      locationId,
      eventType: 'fixture',
      entityType: 'fixture',
      entityId: collision,
      actorId,
      expectedVersion: null,
      idempotencyKey: 'fixture-receipt-collision',
      payload: {},
    });
    const command = await reviewedCommand();
    const before = await state();
    await expect(
      makeExecute({
        ids: idSource(uuid(77400000, 1), uuid(77400000, 2), collision),
      })(command),
    ).rejects.toMatchObject({
      code: 'production_order_backlog_commit_failed',
      status: 503,
    });
    expect(await state()).toEqual(before);
  });
});
