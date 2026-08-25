import { commitOrderBacklogContract } from '@pressly/production-system/operations/demand/commit-order-backlog/contract';
import { makeProductionSystem } from '@pressly/production-system/testing/assembly';
import type { CommitOrderBacklogCommand } from '@pressly/production-system/operations/demand/commit-order-backlog/types';
import { createPostgresRuntime } from '@pressly/postgres/client';
import { asc, eq, sql } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import type { IdSource } from '@pressly/cells/id-source';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedProductionLocationConformanceFacts } from '../src/production-location-conformance.postgres.ts';
import { productionCommandSystemDependencies } from '../src/production-command-system-dependencies.ts';

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
  maxConnections: 12,
  resetDatabaseUrl,
});
const faultDatabase = createPostgresRuntime({
  schema: presslyPostgresOwnerSchemas.production,
  databaseUrl: resetDatabaseUrl,
  maxConnections: 1,
});

beforeAll(async () => {
  await database.check();
  await faultDatabase.check();
});
beforeEach(database.reset);
afterAll(async () => {
  await database.close();
  await faultDatabase.close();
});

const uuid = (prefix: number, suffix: number): string =>
  `${String(prefix).padStart(8, '0')}-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const businessId = '00000000-0000-4000-8000-000000000100';
const locationId = 'location-commit-backlog-parity';
const actorId = uuid(88000000, 1);
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

const productionOrderId = (suffix: number): string =>
  uuid(88000000, 100 + suffix);

const seedOrder = async (input: SeedOrder): Promise<string> => {
  const fulfillmentId = uuid(88200000, input.suffix);
  const demandId = uuid(88300000, input.suffix);
  const orderId = productionOrderId(input.suffix);
  const dueAt = input.dueAt ?? baseDueAt;
  const intake = input.intake ?? false;
  const resolutionState = input.resolutionState ?? 'open';
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.orderDemands)
    .values({
      id: demandId,
      fulfillmentId,
      fulfillmentVersion: 1,
      projectionHash: 'a'.repeat(64),
      admissionState: 'unreleased',
      commercialState: 'open',
      displayReference: `PARITY-${input.suffix}`,
      locationId,
      revisionAt: dueAt,
      phase: 'expected',
      estimatedWeightLbs: 20,
      estimatedWeightSource: 'parity',
      dueAt,
    });
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionOrders)
    .values({
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

const seed = async (input: readonly SeedOrder[]): Promise<string[]> => {
  await seedProductionLocationConformanceFacts(database.db, [
    {
      id: locationId,
      businessId,
      name: 'Commit Backlog Parity Facility',
      timezone: 'America/New_York',
      createdAt: now,
      updatedAt: now,
    },
  ]);
  const ids: string[] = [];
  for (const candidate of input) ids.push(await seedOrder(candidate));
  return ids;
};

type ReviewScope = Pick<
  CommitOrderBacklogCommand,
  'locationId' | 'filter' | 'cutoff' | 'reason' | 'cursor' | 'maxOrders'
>;

const scope = (overrides: Partial<ReviewScope> = {}): ReviewScope => ({
  locationId,
  filter: 'all_due_before_cutoff',
  cutoff,
  reason: 'processor_not_in_use',
  cursor: null,
  maxOrders: 250,
  ...overrides,
});

const decodeTargetCursor = (cursor: string): ReviewScope['cursor'] => {
  const decoded = commitOrderBacklogContract.input.decode({
    body: {
      filter: 'all_due_before_cutoff',
      cutoff,
      reason: 'processor_not_in_use',
      cursor,
      maxOrders: 1,
      note: null,
      previewHash: 'a'.repeat(64),
      idempotencyKey: 'commit-order-backlog-cursor-parity',
    },
    params: { locationId },
    actorId,
  });
  if (decoded.kind === 'invalid')
    throw { code: 'target_cursor_decode_failed', issues: decoded.issues };
  return decoded.value.cursor;
};

const fixedIds = (...values: string[]) => {
  let index = 0;
  const used: string[] = [];
  const ids: IdSource = {
    next: () => {
      const value = values[index] ?? uuid(88900000, 1000 + index + 1);
      index += 1;
      used.push(value);
      return value;
    },
  };
  return { ids, used };
};

const previewTarget = async (reviewScope: ReviewScope) => {
  const preview = await makeProductionSystem({
    ...productionCommandSystemDependencies(),
    db: database.db,
    ids: fixedIds().ids,
    clock: { now: () => now },
  }).cells.previewOrderBacklog.execute(reviewScope);
  if (preview.kind === 'failure') throw preview.failure;
  return preview.value;
};

const reviewedCommand = async (
  reviewScope: ReviewScope,
  overrides: Partial<CommitOrderBacklogCommand> = {},
): Promise<CommitOrderBacklogCommand> => {
  const preview = await previewTarget(reviewScope);
  return {
    ...reviewScope,
    actorId,
    note: null,
    previewHash: preview.previewHash,
    idempotencyKey: 'commit-order-backlog-parity-1',
    ...overrides,
  };
};

const normalizedFailure = (failure: unknown): unknown => {
  if (typeof failure !== 'object' || failure === null) return failure;
  return Object.fromEntries(
    Object.entries(failure).filter(([key]) => key !== 'tag'),
  );
};

const normalizedThrowable = (error: unknown): unknown => {
  if (typeof error !== 'object' || error === null) return { value: error };
  const value = error as Record<string, unknown>;
  return {
    tag: value['tag'],
    kind: value['kind'],
    code: value['code'],
    status: value['status'],
    message: value['message'],
    safeMessage: value['safeMessage'],
  };
};

const executeTarget = async (input: {
  command: CommitOrderBacklogCommand;
  generatedIds: readonly string[];
}) => {
  const idPort = fixedIds(...input.generatedIds);
  const clockReads: string[] = [];
  const observedOperations: string[] = [];
  try {
    const system = makeProductionSystem({
      ...productionCommandSystemDependencies(),
      db: database.db,
      ids: idPort.ids,
      clock: {
        now: () => {
          clockReads.push('clock');
          return now;
        },
      },
      observeCellUnitOfWork: (operation, unitOfWork) => {
        observedOperations.push(operation);
        return unitOfWork;
      },
    });
    const outcome = await system.cells.commitOrderBacklog.execute(
      input.command,
    );
    return {
      outcome:
        outcome.kind === 'success'
          ? outcome
          : { kind: 'failure', failure: normalizedFailure(outcome.failure) },
      throwable: null,
      ids: idPort.used,
      clockReads,
      observedOperations,
    };
  } catch (error) {
    return {
      outcome: null,
      throwable: normalizedThrowable(error),
      ids: idPort.used,
      clockReads,
      observedOperations,
    };
  }
};

const state = async () => {
  const [orderRows, eventRows, locations] = await Promise.all([
    database.db
      .select({
        id: presslyPostgresOwnerSchemas.production.productionOrders.id,
        operationalStatus:
          presslyPostgresOwnerSchemas.production.productionOrders
            .operationalStatus,
        executionStatus:
          presslyPostgresOwnerSchemas.production.productionOrders
            .executionStatus,
        resolutionState:
          presslyPostgresOwnerSchemas.production.productionOrders
            .resolutionState,
        resolvedAt:
          presslyPostgresOwnerSchemas.production.productionOrders.resolvedAt,
        resolvedBy:
          presslyPostgresOwnerSchemas.production.productionOrders.resolvedBy,
        resolutionReason:
          presslyPostgresOwnerSchemas.production.productionOrders
            .resolutionReason,
        resolutionNote:
          presslyPostgresOwnerSchemas.production.productionOrders
            .resolutionNote,
        bulkOperationId:
          presslyPostgresOwnerSchemas.production.productionOrders
            .resolutionBulkOperationId,
        version:
          presslyPostgresOwnerSchemas.production.productionOrders.version,
      })
      .from(presslyPostgresOwnerSchemas.production.productionOrders)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.productionOrders.id)),
    database.db
      .select({
        id: presslyPostgresOwnerSchemas.production.workEvents.id,
        locationId:
          presslyPostgresOwnerSchemas.production.workEvents.locationId,
        eventType: presslyPostgresOwnerSchemas.production.workEvents.eventType,
        entityType:
          presslyPostgresOwnerSchemas.production.workEvents.entityType,
        entityId: presslyPostgresOwnerSchemas.production.workEvents.entityId,
        actorId: presslyPostgresOwnerSchemas.production.workEvents.actorId,
        expectedVersion:
          presslyPostgresOwnerSchemas.production.workEvents.expectedVersion,
        idempotencyKey:
          presslyPostgresOwnerSchemas.production.workEvents.idempotencyKey,
        payload: presslyPostgresOwnerSchemas.production.workEvents.payload,
      })
      .from(presslyPostgresOwnerSchemas.production.workEvents)
      .orderBy(
        asc(presslyPostgresOwnerSchemas.production.workEvents.createdAt),
        asc(presslyPostgresOwnerSchemas.production.workEvents.id),
      ),
    database.db
      .select({
        revision:
          presslyPostgresOwnerSchemas.production.productionLocations
            .liveRevision,
      })
      .from(presslyPostgresOwnerSchemas.production.productionLocations)
      .orderBy(
        asc(presslyPostgresOwnerSchemas.production.productionLocations.id),
      ),
  ]);
  return {
    orders: orderRows,
    events: eventRows,
    liveRevisions: locations.map((location) => location.revision),
  };
};

const runOnce = async (input: {
  orders: readonly SeedOrder[];
  reviewScope?: ReviewScope;
  command?: (reviewed: CommitOrderBacklogCommand) => CommitOrderBacklogCommand;
  beforeExecute?: () => Promise<void>;
  generatedIds: readonly string[];
}) => {
  await database.reset();
  await seed(input.orders);
  const reviewed = await reviewedCommand(input.reviewScope ?? scope());
  await input.beforeExecute?.();
  const execution = await executeTarget({
    command: input.command?.(reviewed) ?? reviewed,
    generatedIds: input.generatedIds,
  });
  return { execution, state: await state() };
};

const observeTarget = async (input: Parameters<typeof runOnce>[0]) => {
  const target = await runOnce(input);
  if (target.execution.observedOperations.length > 0)
    expect(target.execution.observedOperations).toContain(
      'production.commit_order_backlog',
    );
  return target;
};

describe('production.commit-order-backlog.v1 target PostgreSQL conformance', () => {
  it('preserves classification, guard, transition, dueAt/id order, envelopes, revision, clock, and IDs', async () => {
    const bulkId = uuid(88400000, 1);
    const orderEventA = uuid(88400000, 2);
    const orderEventB = uuid(88400000, 3);
    const receiptId = uuid(88400000, 4);
    const target = await observeTarget({
      orders: [
        { suffix: 2 },
        { suffix: 1 },
        {
          suffix: 3,
          intake: true,
          manualAdmission: true,
          priority: true,
          pendingPlacement: true,
        },
        {
          suffix: 4,
          operationalStatus: 'scheduled',
          executionStatus: 'scheduled',
        },
        { suffix: 5, resolutionState: 'resolved_without_production' },
        {
          suffix: 6,
          operationalStatus: 'finished',
          executionStatus: 'finished',
        },
      ],
      generatedIds: [bulkId, orderEventA, orderEventB, receiptId],
      command: (reviewed) => ({
        ...reviewed,
        note: 'Manager reviewed every bounded candidate.',
      }),
    });
    expect(target.execution.outcome).toMatchObject({
      kind: 'success',
      value: {
        bulkOperationId: bulkId,
        resolved: [
          { orderId: productionOrderId(1), version: 2 },
          { orderId: productionOrderId(2), version: 2 },
        ],
        resolvedCount: 2,
        committedAt: now.toISOString(),
        replayed: false,
      },
    });
    expect(target.execution.ids).toEqual([
      bulkId,
      orderEventA,
      orderEventB,
      receiptId,
    ]);
    expect(target.execution.clockReads).toEqual(['clock']);
    expect(target.state.events.map((event) => event.eventType)).toEqual([
      'production_order_bulk_resolved_without_production',
      'production_order_bulk_resolved_without_production',
      'production_order_backlog_bulk_resolution_committed',
    ]);
    expect(target.state.events[0]).toMatchObject({
      id: orderEventA,
      entityId: productionOrderId(1),
      expectedVersion: 1,
      payload: {
        from: 'open',
        resolutionState: 'resolved_without_production',
        version: 2,
        _idempotency: { version: 1 },
      },
    });
    expect(target.state.events[2]).toMatchObject({
      id: receiptId,
      entityId: bulkId,
      payload: {
        candidateCount: 6,
        resolvedCount: 2,
        _idempotency: { version: 1 },
      },
    });
    expect(target.state.liveRevisions).toEqual([3]);
  });

  it('preserves audited aggregate-only no-op for review and historical candidates', async () => {
    const bulkId = uuid(88500000, 1);
    const receiptId = uuid(88500000, 2);
    const target = await observeTarget({
      orders: [
        { suffix: 1, intake: true },
        { suffix: 2, resolutionState: 'resolved_without_production' },
        {
          suffix: 3,
          operationalStatus: 'scheduled',
          executionStatus: 'scheduled',
        },
      ],
      generatedIds: [bulkId, receiptId],
    });
    expect(target.execution.outcome).toMatchObject({
      kind: 'success',
      value: { resolvedCount: 0, resolved: [], replayed: false },
    });
    expect(target.state.events).toHaveLength(1);
    expect(target.state.events[0]).toMatchObject({
      id: receiptId,
      eventType: 'production_order_backlog_bulk_resolution_committed',
    });
    expect(target.state.liveRevisions).toEqual([1]);
  });

  it('preserves the missing-location empty preview followed by the Production-owned FK rollback', async () => {
    const target = await observeTarget({
      orders: [],
      reviewScope: scope({ locationId: 'missing-location' }),
      generatedIds: [uuid(88600000, 1), uuid(88600000, 2)],
    });
    expect(target.execution.throwable).toMatchObject({
      code: 'production_order_backlog_commit_failed',
      status: 503,
    });
    expect(target.state).toEqual({
      orders: [],
      events: [],
      liveRevisions: [0],
    });
  });

  it('preserves cursor binding, malformed bytes, and preview-hash fence before IDs or clock', async () => {
    await database.reset();
    await seed([{ suffix: 1 }, { suffix: 2 }]);
    const first = await previewTarget(scope({ maxOrders: 1 }));
    if (first.nextCursor === null) throw { code: 'cursor_missing' };
    const cursor = decodeTargetCursor(first.nextCursor);

    const cursorTarget = await observeTarget({
      orders: [{ suffix: 1 }, { suffix: 2 }],
      reviewScope: scope({ maxOrders: 1, cursor }),
      generatedIds: [],
      command: (reviewed) => ({
        ...reviewed,
        reason: 'duplicate_or_test',
      }),
    });
    expect(cursorTarget.execution.outcome).toMatchObject({
      kind: 'failure',
      failure: {
        code: 'production_order_backlog_cursor_invalid',
        details: {
          reason: 'production_order_backlog_cursor_scope_mismatch',
        },
      },
    });
    expect(cursorTarget.execution.ids).toEqual([]);
    expect(cursorTarget.execution.clockReads).toEqual([]);

    const staleTarget = await observeTarget({
      orders: [{ suffix: 1 }],
      generatedIds: [],
      beforeExecute: async () => {
        await database.db
          .update(presslyPostgresOwnerSchemas.production.productionOrders)
          .set({ version: 2 })
          .where(
            eq(
              presslyPostgresOwnerSchemas.production.productionOrders.id,
              productionOrderId(1),
            ),
          );
      },
    });
    expect(staleTarget.execution.outcome).toMatchObject({
      kind: 'failure',
      failure: { code: 'production_order_backlog_preview_stale' },
    });
    expect(staleTarget.execution.ids).toEqual([]);
    expect(staleTarget.execution.clockReads).toEqual([]);
    expect(staleTarget.state.events).toEqual([]);
  });

  it('preserves exact replay and divergent reuse without duplicate work or revision', async () => {
    const runSequence = async () => {
      await database.reset();
      await seed([{ suffix: 1 }]);
      const reviewed = await reviewedCommand(scope());
      const idPort = fixedIds(
        uuid(88700000, 1),
        uuid(88700000, 2),
        uuid(88700000, 3),
      );
      const clockReads: string[] = [];
      const target = makeProductionSystem({
        ...productionCommandSystemDependencies(),
        db: database.db,
        ids: idPort.ids,
        clock: {
          now: () => {
            clockReads.push('clock');
            return now;
          },
        },
      }).cells.commitOrderBacklog.execute;
      const first = await target(reviewed);
      const replay = await target(reviewed);
      const divergent = await target({ ...reviewed, note: 'Different.' });
      return {
        outcomes: [first, replay, divergent].map((outcome) =>
          outcome.kind === 'success'
            ? outcome
            : { kind: 'failure', failure: normalizedFailure(outcome.failure) },
        ),
        ids: idPort.used,
        clockReads,
        state: await state(),
      };
    };

    const target = await runSequence();
    expect(target.outcomes).toEqual([
      expect.objectContaining({
        kind: 'success',
        value: expect.objectContaining({ replayed: false }),
      }),
      expect.objectContaining({
        kind: 'success',
        value: expect.objectContaining({ replayed: true }),
      }),
      expect.objectContaining({
        kind: 'failure',
        failure: expect.objectContaining({
          code: 'production_idempotency_conflict',
        }),
      }),
    ]);
    expect(target.state.events).toHaveLength(2);
    expect(target.state.liveRevisions).toEqual([2]);
  });

  it('preserves same-key and different-key same-version races', async () => {
    const race = async (sameKey: boolean) => {
      await database.reset();
      await seed([{ suffix: 1 }]);
      const reviewed = await reviewedCommand(scope());
      const firstIds = fixedIds(
        uuid(88800000, 1),
        uuid(88800000, 2),
        uuid(88800000, 3),
      );
      const secondIds = fixedIds(
        uuid(88800000, 1),
        uuid(88800000, 2),
        uuid(88800000, 3),
      );
      const commands = sameKey
        ? [reviewed, reviewed]
        : [
            { ...reviewed, idempotencyKey: 'backlog-race-a' },
            { ...reviewed, idempotencyKey: 'backlog-race-b' },
          ];
      const execute =
        (ids: IdSource) => async (command: CommitOrderBacklogCommand) => {
          const outcome = await makeProductionSystem({
            ...productionCommandSystemDependencies(),
            db: database.db,
            ids,
            clock: { now: () => now },
          }).cells.commitOrderBacklog.execute(command);
          return outcome.kind === 'success'
            ? { tag: 'ok' as const, value: outcome.value }
            : { tag: 'err' as const, error: outcome.failure };
        };
      const outcomes = await Promise.all([
        execute(firstIds.ids)(commands[0]!),
        execute(secondIds.ids)(commands[1]!),
      ]);
      const durableState = await state();
      const winnerKey = sameKey
        ? null
        : (durableState.events.find(
            (event) =>
              event.eventType ===
              'production_order_backlog_bulk_resolution_committed',
          )?.idempotencyKey ?? null);
      return {
        outcomes: outcomes
          .map((outcome) =>
            outcome.tag === 'ok'
              ? { kind: 'success', value: outcome.value }
              : { kind: 'failure', failure: normalizedFailure(outcome.error) },
          )
          .sort((left, right) =>
            JSON.stringify(left).localeCompare(JSON.stringify(right)),
          ),
        state: sameKey
          ? durableState
          : {
              ...durableState,
              events: durableState.events.map((event) => ({
                ...event,
                idempotencyKey:
                  event.eventType ===
                  'production_order_backlog_bulk_resolution_committed'
                    ? 'race-winner'
                    : 'bulk-order:race-winner',
              })),
            },
        winnerKey,
      };
    };

    for (const sameKey of [true, false]) {
      const target = await race(sameKey);
      if (sameKey) {
        expect(target.winnerKey).toBeNull();
        expect(target.state.events).toHaveLength(2);
        expect(target.outcomes).toEqual(
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
      } else {
        expect(['backlog-race-a', 'backlog-race-b']).toContain(
          target.winnerKey,
        );
        expect(
          target.outcomes.filter(({ kind }) => kind === 'success'),
        ).toHaveLength(1);
        expect(target.outcomes).toContainEqual(
          expect.objectContaining({
            kind: 'failure',
            failure: expect.objectContaining({
              code: 'production_order_backlog_preview_stale',
            }),
          }),
        );
      }
    }
  });

  it('preserves late per-order CAS rollback through the public target owner', async () => {
    const dropFault = async () => {
      await faultDatabase.db.execute(sql`
        drop trigger if exists parity_skip_second_backlog_update
        on production_orders
      `);
      await faultDatabase.db.execute(sql`
        drop function if exists parity_skip_second_backlog_update()
      `);
    };
    const beforeExecute = async () => {
      await dropFault();
      await faultDatabase.db.execute(sql`
        create or replace function parity_skip_second_backlog_update()
        returns trigger language plpgsql as $$
        begin
          if old.id = '88000000-0000-4000-8000-000000000102'::uuid then
            return null;
          end if;
          return new;
        end;
        $$
      `);
      await faultDatabase.db.execute(sql`
        create trigger parity_skip_second_backlog_update
        before update on production_orders
        for each row execute function parity_skip_second_backlog_update()
      `);
    };
    try {
      const target = await observeTarget({
        orders: [{ suffix: 1 }, { suffix: 2 }],
        generatedIds: [uuid(89000000, 1), uuid(89000000, 2), uuid(89000000, 3)],
        beforeExecute,
      });
      expect(target.execution.outcome).toMatchObject({
        kind: 'failure',
        failure: { code: 'production_order_backlog_commit_conflict' },
      });
      expect(target.state.events).toEqual([]);
      expect(target.state.liveRevisions).toEqual([0]);
      expect(target.state.orders).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ resolutionState: 'open', version: 1 }),
          expect.objectContaining({ resolutionState: 'open', version: 1 }),
        ]),
      );
    } finally {
      await dropFault();
    }
  });

  it.each([
    { name: 'per-order event', collisionIndex: 1 },
    { name: 'aggregate receipt', collisionIndex: 2 },
  ])('preserves $name append rollback byte-for-byte', async (candidate) => {
    const generated = [uuid(89100000, 1), uuid(89100000, 2), uuid(89100000, 3)];
    const collision = generated[candidate.collisionIndex]!;
    const beforeExecute = async () => {
      await database.db
        .insert(presslyPostgresOwnerSchemas.production.workEvents)
        .values({
          id: collision,
          locationId,
          eventType: 'fixture',
          entityType: 'fixture',
          entityId: collision,
          actorId,
          expectedVersion: null,
          idempotencyKey: `fixture-${candidate.collisionIndex}`,
          payload: {},
        });
    };
    const target = await observeTarget({
      orders: [{ suffix: 1 }],
      generatedIds: generated,
      beforeExecute,
    });
    expect(target.execution.throwable).toMatchObject({
      code: 'production_order_backlog_commit_failed',
      status: 503,
    });
    expect(target.state.events).toEqual([
      expect.objectContaining({ id: collision, eventType: 'fixture' }),
    ]);
    expect(target.state.liveRevisions).toEqual([1]);
    expect(target.state.orders[0]).toMatchObject({
      resolutionState: 'open',
      version: 1,
    });
  });
});
