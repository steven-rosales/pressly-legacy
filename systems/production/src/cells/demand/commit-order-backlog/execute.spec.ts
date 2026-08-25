import { proveOperation } from '@pressly/testkit/operation-proof';
import { commitOrderBacklogCellDeclaration } from './cell.ts';
import { isAppError } from '@pressly/errors/app-error';
import { invariantViolationError } from '@pressly/errors/factories';
import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import type {
  ProductionOrderBacklogSnapshot,
  ProductionOrderBacklogSnapshotOrder,
} from '../../../read-models/production-order-backlog/model.ts';
import {
  classifyProductionOrderBacklogSnapshot,
  hashProductionOrderBacklogPreview,
} from '../../../read-models/production-order-backlog/project.ts';
import {
  makeExecuteCommitOrderBacklog,
  type CommitOrderBacklogRepository,
  type CommitOrderBacklogTransactionRepository,
  type CommitOrderBacklogWorkEvent,
} from './execute.ts';
import {
  commitOrderBacklogIdempotency,
  serializeCommitOrderBacklogBulkCommand,
  type StoredCommitOrderBacklogWorkEvent,
} from './idempotency.ts';
import type { CommitOrderBacklogCommand } from './types.ts';

const uuid = (suffix: number): string =>
  `75000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const now = new Date('2026-08-22T16:00:00.000Z');

const order = (
  suffix: number,
  overrides: Partial<ProductionOrderBacklogSnapshotOrder> = {},
): ProductionOrderBacklogSnapshotOrder => ({
  orderId: uuid(suffix),
  locationId: 'location-1',
  displayReference: `ORDER-${suffix}`,
  dueAt: new Date(`2026-07-0${suffix}T12:00:00.000Z`),
  productionVersion: 1,
  resolutionState: 'open',
  executionStatus: 'unassigned',
  operationalStatus: 'release_pending',
  hasIntake: false,
  hasManualAdmission: false,
  isPriority: false,
  hasPendingPlacement: false,
  hasShiftSelection: false,
  hasBatchMembership: false,
  hasStageAttempt: false,
  hasRoute: false,
  ...overrides,
});

const scope = {
  locationId: 'location-1',
  actorId: uuid(90),
  filter: 'all_due_before_cutoff' as const,
  cutoff: '2026-08-01T00:00:00.000Z',
  reason: 'processor_not_in_use' as const,
  cursor: null,
  maxOrders: 250,
  note: null,
  idempotencyKey: 'commit-order-backlog-1',
};

const commandFor = (
  snapshot: ProductionOrderBacklogSnapshot,
  overrides: Partial<CommitOrderBacklogCommand> = {},
): CommitOrderBacklogCommand => {
  const classified = classifyProductionOrderBacklogSnapshot(
    productionRules,
    snapshot,
  );
  return {
    ...scope,
    previewHash: hashProductionOrderBacklogPreview(scope, classified),
    ...overrides,
  };
};

const cloneSnapshot = (
  snapshot: ProductionOrderBacklogSnapshot,
): ProductionOrderBacklogSnapshot => ({
  hasMore: snapshot.hasMore,
  orders: snapshot.orders.map((candidate) => ({ ...candidate })),
});

const storedEvent = (
  event: Extract<
    CommitOrderBacklogWorkEvent,
    { eventType: 'production_order_backlog_bulk_resolution_committed' }
  >,
): StoredCommitOrderBacklogWorkEvent => ({
  valid: true,
  command: serializeCommitOrderBacklogBulkCommand(event.idempotency.command),
  result: { ...event.idempotency.result },
});

const makeRepository = (
  initial: ProductionOrderBacklogSnapshot,
  options: Readonly<{
    failOrderId?: string;
    findSequence?: readonly (StoredCommitOrderBacklogWorkEvent | null)[];
    throwOnLoad?: unknown;
  }> = {},
) => {
  let state = cloneSnapshot(initial);
  const receipts = new Map<string, StoredCommitOrderBacklogWorkEvent>();
  const trace: string[] = [];
  const events: CommitOrderBacklogWorkEvent[] = [];
  let findIndex = 0;
  const repo: CommitOrderBacklogRepository<StoredCommitOrderBacklogWorkEvent> =
    {
      transaction: async (work) => {
        const working = cloneSnapshot(state);
        const workingReceipts = new Map(receipts);
        const workingEvents = [...events];
        const operations: CommitOrderBacklogTransactionRepository<StoredCommitOrderBacklogWorkEvent> =
          {
            findWorkEvent: async (key) => {
              trace.push('find');
              const sequenced = options.findSequence?.[findIndex++];
              return sequenced === undefined
                ? (workingReceipts.get(key) ?? null)
                : sequenced;
            },
            lockLocationScheduling: async () => {
              trace.push('lock');
            },
            loadSnapshotForUpdate: async () => {
              trace.push('load');
              if (options.throwOnLoad !== undefined) throw options.throwOnLoad;
              return cloneSnapshot(working);
            },
            resolveOrder: async (input) => {
              trace.push(`resolve:${input.orderId}`);
              if (input.orderId === options.failOrderId) return null;
              const current = working.orders.find(
                (candidate) => candidate.orderId === input.orderId,
              );
              if (
                current === undefined ||
                current.productionVersion !== input.expectedVersion ||
                current.resolutionState !== input.lifecycle.from
              )
                return null;
              Object.assign(current, {
                resolutionState: 'resolved_without_production',
                productionVersion: input.expectedVersion + 1,
              });
              return {
                orderId: current.orderId,
                resolutionState: 'resolved_without_production' as const,
                version: input.expectedVersion + 1,
              };
            },
            appendWorkEvent: async (event) => {
              trace.push(`event:${event.eventType}`);
              workingEvents.push(event);
              if (
                event.eventType ===
                'production_order_backlog_bulk_resolution_committed'
              )
                workingReceipts.set(event.idempotencyKey, storedEvent(event));
            },
          };
        const outcome = await work(operations);
        if (outcome.kind === 'success') {
          state = working;
          receipts.clear();
          workingReceipts.forEach((value, key) => receipts.set(key, value));
          events.splice(0, events.length, ...workingEvents);
        }
        return outcome;
      },
    };
  return {
    repo,
    trace,
    events,
    state: () => cloneSnapshot(state),
    receipt: (key: string) => receipts.get(key) ?? null,
  };
};

const executeWith = (
  repo: CommitOrderBacklogRepository<StoredCommitOrderBacklogWorkEvent>,
  overrides: Readonly<{
    clock?: { now: () => Date };
    ids?: { next: () => string };
  }> = {},
) =>
  makeExecuteCommitOrderBacklog({
    repo,
    idempotency: commitOrderBacklogIdempotency,
    policy: productionRules,
    clock: overrides.clock ?? { now: () => now },
    ids: overrides.ids ?? { next: () => uuid(99) },
  });

describe('commit order backlog executor', () => {
  proveOperation({
    operationId: 'production.commit-order-backlog.v1',
    declaration: commitOrderBacklogCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'double-checks replay around the scheduling lock and audits only ready orders',
        proves: ['executor-success'],
        run: async () => {
          const snapshot = {
            hasMore: false,
            orders: [order(1), order(2, { hasIntake: true })],
          };
          const memory = makeRepository(snapshot);
          const outcome = await executeWith(memory.repo)(commandFor(snapshot));

          expect(outcome).toMatchObject({
            kind: 'success',
            value: {
              bulkOperationId: uuid(99),
              resolvedCount: 1,
              resolved: [{ orderId: uuid(1), version: 2 }],
              replayed: false,
            },
          });
          expect(memory.trace).toEqual([
            'find',
            'lock',
            'find',
            'load',
            `resolve:${uuid(1)}`,
            'event:production_order_bulk_resolved_without_production',
            'event:production_order_backlog_bulk_resolution_committed',
          ]);
          expect(memory.events).toHaveLength(2);
          expect(memory.events[0]?.payload).not.toHaveProperty('note');
          expect(
            memory.state().orders.map((candidate) => candidate.resolutionState),
          ).toEqual(['resolved_without_production', 'open']);
        },
      },
    ],
  });

  it('replays before the lock and rejects divergent reuse without effects', async () => {
    const snapshot = { hasMore: false, orders: [order(1)] };
    const memory = makeRepository(snapshot);
    const execute = executeWith(memory.repo);
    const command = commandFor(snapshot);
    await expect(execute(command)).resolves.toMatchObject({
      kind: 'success',
      value: { replayed: false },
    });
    memory.trace.splice(0);
    await expect(execute(command)).resolves.toMatchObject({
      kind: 'success',
      value: { replayed: true },
    });
    expect(memory.trace).toEqual(['find']);
    await expect(
      execute({ ...command, note: 'Different command' }),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_idempotency_conflict' },
    });
  });

  it('replays a concurrent winner only at the after-lock checkpoint', async () => {
    const snapshot = { hasMore: false, orders: [order(1)] };
    const seeded = makeRepository(snapshot);
    const command = commandFor(snapshot);
    await executeWith(seeded.repo)(command);
    const receipt = seeded.receipt(command.idempotencyKey);
    expect(receipt).not.toBeNull();
    const memory = makeRepository(snapshot, {
      findSequence: [null, receipt],
    });
    await expect(executeWith(memory.repo)(command)).resolves.toMatchObject({
      kind: 'success',
      value: { replayed: true },
    });
    expect(memory.trace).toEqual(['find', 'lock', 'find']);
  });

  it('commits an audited no-op when no order is ready', async () => {
    const snapshot = {
      hasMore: false,
      orders: [order(1, { hasIntake: true })],
    };
    const memory = makeRepository(snapshot);
    await expect(
      executeWith(memory.repo)(commandFor(snapshot)),
    ).resolves.toMatchObject({
      kind: 'success',
      value: { resolvedCount: 0, resolved: [], replayed: false },
    });
    expect(memory.events.map((event) => event.eventType)).toEqual([
      'production_order_backlog_bulk_resolution_committed',
    ]);
  });

  it('rejects cursor, preview-hash, and late per-order CAS conflicts without partial commit', async () => {
    const snapshot = { hasMore: false, orders: [order(1), order(2)] };
    const cursorRepo = makeRepository(snapshot);
    await expect(
      makeExecuteCommitOrderBacklog({
        repo: cursorRepo.repo,
        idempotency: commitOrderBacklogIdempotency,
        policy: productionRules,
        cursor: {
          encode: vi.fn(),
          decode: () => ({
            kind: 'invalid',
            failure: {
              code: 'production_order_backlog_cursor_scope_mismatch',
              message:
                'The backlog cursor does not belong to this review scope.',
            },
          }),
        },
        clock: { now: vi.fn() },
        ids: { next: vi.fn() },
      })(commandFor(snapshot)),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_order_backlog_cursor_invalid' },
    });
    expect(cursorRepo.trace).toEqual([]);

    const staleRepo = makeRepository(snapshot);
    await expect(
      executeWith(staleRepo.repo)({
        ...commandFor(snapshot),
        previewHash: 'f'.repeat(64),
      }),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_order_backlog_preview_stale' },
    });
    expect(staleRepo.events).toEqual([]);

    const casRepo = makeRepository(snapshot, { failOrderId: uuid(2) });
    await expect(
      executeWith(casRepo.repo)(commandFor(snapshot)),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_order_backlog_commit_conflict' },
    });
    expect(casRepo.events).toEqual([]);
    expect(
      casRepo
        .state()
        .orders.every((candidate) => candidate.resolutionState === 'open'),
    ).toBe(true);
  });

  it('maps unknown repository faults and preserves owned AppErrors', async () => {
    const snapshot = { hasMore: false, orders: [order(1)] };
    const cause = { database: 'offline' };
    const unknown = makeRepository(snapshot, { throwOnLoad: cause });
    await expect(
      executeWith(unknown.repo)(commandFor(snapshot)),
    ).rejects.toMatchObject({
      code: 'production_order_backlog_commit_failed',
      status: 503,
      cause,
    });

    const owned = invariantViolationError({
      code: 'production_backlog_fixture_invalid',
      message: 'Fixture invalid.',
    });
    const preserve = makeRepository(snapshot, { throwOnLoad: owned });
    try {
      await executeWith(preserve.repo)(commandFor(snapshot));
      expect.unreachable('Owned error must throw.');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      expect(error).toBe(owned);
    }
  });
});
