import type {
  CommitProductionOrderBacklogCommand,
  ProductionOrderBacklogPreview,
} from '@pressly/contracts';
import { describe, expect, it, vi } from 'vitest';
import type {
  BacklogSnapshotScope,
  ProductionOrderBacklogSnapshot,
  ProductionOrderBacklogSnapshotOrder,
  ReviewProductionOrderBacklogRepository,
  ReviewProductionOrderBacklogTransaction,
} from '../../src/review-production-order-backlog/review-production-order-backlog.port.ts';
import {
  makeCommitProductionOrderBacklog,
  makePreviewProductionOrderBacklog,
} from '../../src/review-production-order-backlog/review-production-order-backlog.usecase.ts';
import { allowPolicy, makeIds } from '../support/production.fake.ts';

const ids = {
  actor: '00000000-0000-4000-8000-000000000100',
  ready: '00000000-0000-4000-8000-000000000001',
  review: '00000000-0000-4000-8000-000000000002',
  kept: '00000000-0000-4000-8000-000000000003',
  resolved: '00000000-0000-4000-8000-000000000004',
  finished: '00000000-0000-4000-8000-000000000005',
} as const;

const now = new Date('2026-07-27T04:00:00.000Z');
const cutoff = '2026-07-01T00:00:00.000Z';

const snapshotOrder = (
  orderId: string,
  overrides: Partial<ProductionOrderBacklogSnapshotOrder> = {},
): ProductionOrderBacklogSnapshotOrder => ({
  orderId,
  locationId: 'location-1',
  displayReference: `Order ${orderId.slice(-4)}`,
  dueAt: new Date('2026-06-01T00:00:00.000Z'),
  productionVersion: 2,
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

const previewCommand = {
  locationId: 'location-1',
  filter: 'all_due_before_cutoff' as const,
  cutoff,
  reason: 'processor_not_in_use' as const,
  cursor: null,
  maxOrders: 250,
};

const cloneSnapshot = (
  snapshot: ProductionOrderBacklogSnapshot,
): ProductionOrderBacklogSnapshot => ({
  hasMore: snapshot.hasMore,
  orders: snapshot.orders.map((order) => ({ ...order })),
});

const pageSnapshot = (
  snapshot: ProductionOrderBacklogSnapshot,
  scope: BacklogSnapshotScope,
): ProductionOrderBacklogSnapshot => {
  const ordered = [...snapshot.orders].sort(
    (left, right) =>
      left.dueAt.getTime() - right.dueAt.getTime() ||
      left.orderId.localeCompare(right.orderId),
  );
  const after = ordered.filter(
    (order) =>
      scope.after === null ||
      order.dueAt > scope.after.dueAt ||
      (order.dueAt.getTime() === scope.after.dueAt.getTime() &&
        order.orderId > scope.after.orderId),
  );
  return {
    hasMore: after.length > scope.maxOrders,
    orders: after.slice(0, scope.maxOrders).map((order) => ({ ...order })),
  };
};

const makeRepository = (
  initial: ProductionOrderBacklogSnapshot,
  options: Readonly<{ failOrderId?: string }> = {},
) => {
  let stored = cloneSnapshot(initial);
  const events = new Map<
    string,
    Readonly<{ command: unknown; result: unknown; valid: true }>
  >();
  const callOrder: string[] = [];
  const lockLocationScheduling = vi.fn(async () => {
    callOrder.push('lock');
  });
  const resolveOrder = vi.fn(
    async (
      input: Parameters<
        ReviewProductionOrderBacklogTransaction['resolveOrder']
      >[0],
      working: ProductionOrderBacklogSnapshot,
    ) => {
      if (input.orderId === options.failOrderId) return null;
      const current = working.orders.find(
        (order) => order.orderId === input.orderId,
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
        orderId: input.orderId,
        resolutionState: 'resolved_without_production' as const,
        version: input.expectedVersion + 1,
      };
    },
  );
  const appendWorkEvent = vi.fn();

  const repo: ReviewProductionOrderBacklogRepository = {
    loadSnapshot: vi.fn(async (input) => pageSnapshot(stored, input)),
    transaction: async (work) => {
      const working = cloneSnapshot(stored);
      const workingEvents = new Map(events);
      const operations: ReviewProductionOrderBacklogTransaction = {
        findWorkEvent: async (key) => workingEvents.get(key) ?? null,
        lockLocationScheduling,
        loadSnapshotForUpdate: async (input) => {
          callOrder.push('load');
          return pageSnapshot(working, input);
        },
        resolveOrder: (input) => resolveOrder(input, working),
        appendWorkEvent: async (event) => {
          appendWorkEvent(event);
          workingEvents.set(event.idempotencyKey, {
            command: event.idempotency.command,
            result: event.idempotency.result,
            valid: true,
          });
        },
      };
      const output = await work(operations);
      stored = working;
      events.clear();
      workingEvents.forEach((value, key) => events.set(key, value));
      return output;
    },
  };

  return {
    repo,
    get stored() {
      return cloneSnapshot(stored);
    },
    callOrder,
    lockLocationScheduling,
    resolveOrder,
    appendWorkEvent,
    mutateOrder: (
      orderId: string,
      change: Partial<ProductionOrderBacklogSnapshotOrder>,
    ) => {
      const order = stored.orders.find(
        (candidate) => candidate.orderId === orderId,
      );
      if (order !== undefined) Object.assign(order, change);
    },
  };
};

const preview = async (
  repo: ReviewProductionOrderBacklogRepository,
): Promise<ProductionOrderBacklogPreview> => {
  const outcome = await makePreviewProductionOrderBacklog({
    repo,
    policy: allowPolicy,
    clock: { now: () => now },
  })(previewCommand);
  if (outcome.tag === 'err') throw outcome.error;
  return outcome.value;
};

const commit = (
  repo: ReviewProductionOrderBacklogRepository,
  reviewed: ProductionOrderBacklogPreview,
  overrides: Partial<CommitProductionOrderBacklogCommand> = {},
) =>
  makeCommitProductionOrderBacklog({
    repo,
    policy: allowPolicy,
    clock: { now: () => now },
    ids: makeIds(),
  })({
    ...previewCommand,
    note: null,
    previewHash: reviewed.previewHash,
    idempotencyKey: 'bulk-resolution-1',
    actorId: ids.actor,
    ...overrides,
  });

describe('review production order backlog', () => {
  it('partitions the bounded snapshot with policy-owned facts', async () => {
    const repository = makeRepository({
      hasMore: false,
      orders: [
        snapshotOrder(ids.ready),
        snapshotOrder(ids.review, { hasIntake: true, isPriority: true }),
        snapshotOrder(ids.kept, {
          executionStatus: 'scheduled',
          operationalStatus: 'scheduled',
        }),
        snapshotOrder(ids.resolved, {
          resolutionState: 'resolved_without_production',
        }),
        snapshotOrder(ids.finished, {
          executionStatus: 'finished',
          operationalStatus: 'finished',
        }),
      ],
    });

    const reviewed = await preview(repository.repo);

    expect(reviewed.candidateCount).toBe(5);
    expect(reviewed.groups.readyToArchive).toEqual([
      expect.objectContaining({
        orderId: ids.ready,
        reasons: ['no_operator_owned_facts'],
      }),
    ]);
    expect(reviewed.groups.reviewIndividually).toEqual([
      expect.objectContaining({
        orderId: ids.review,
        reasons: ['intake_recorded', 'priority'],
      }),
    ]);
    expect(reviewed.groups.keptForSafety).toEqual([
      expect.objectContaining({
        orderId: ids.kept,
        reasons: ['execution_committed'],
      }),
    ]);
    expect(
      reviewed.groups.alreadyHistorical.map((order) => order.orderId),
    ).toEqual([ids.resolved, ids.finished]);
  });

  it('keeps old work when canonical Production participation blocks it', async () => {
    const repository = makeRepository({
      hasMore: false,
      orders: [
        snapshotOrder(ids.kept, {
          hasBatchMembership: true,
        }),
      ],
    });

    const reviewed = await preview(repository.repo);

    expect(reviewed.groups.readyToArchive).toHaveLength(0);
    expect(reviewed.groups.keptForSafety[0]).toMatchObject({
      orderId: ids.kept,
      reasons: ['batch_membership_exists'],
    });
  });

  it('hashes canonical candidate order and every scope input', async () => {
    const left = makeRepository({
      hasMore: false,
      orders: [snapshotOrder(ids.ready), snapshotOrder(ids.review)],
    });
    const right = makeRepository({
      hasMore: false,
      orders: [snapshotOrder(ids.review), snapshotOrder(ids.ready)],
    });

    const leftPreview = await preview(left.repo);
    const rightPreview = await preview(right.repo);
    expect(leftPreview.previewHash).toBe(rightPreview.previewHash);

    const changed = await makePreviewProductionOrderBacklog({
      repo: right.repo,
      policy: allowPolicy,
      clock: { now: () => now },
    })({ ...previewCommand, reason: 'completed_outside_pressly' });
    expect(changed.tag).toBe('ok');
    if (changed.tag === 'ok')
      expect(changed.value.previewHash).not.toBe(leftPreview.previewHash);
  });

  it('re-locks, recomputes, and commits only safe candidates in one audit boundary', async () => {
    const repository = makeRepository({
      hasMore: false,
      orders: [
        snapshotOrder(ids.ready),
        snapshotOrder(ids.review, { hasIntake: true }),
        snapshotOrder(ids.kept, { hasShiftSelection: true }),
      ],
    });
    const reviewed = await preview(repository.repo);

    const outcome = await commit(repository.repo, reviewed, {
      note: 'Historical reset reviewed by the manager.',
    });

    expect(outcome).toMatchObject({
      tag: 'ok',
      value: {
        resolvedCount: 1,
        resolved: [
          {
            orderId: ids.ready,
            resolutionState: 'resolved_without_production',
            version: 3,
          },
        ],
        replayed: false,
      },
    });
    expect(repository.callOrder.slice(0, 2)).toEqual(['lock', 'load']);
    expect(repository.resolveOrder).toHaveBeenCalledTimes(1);

    const written = repository.appendWorkEvent.mock.calls.map(
      ([event]) => event,
    );
    expect(written).toHaveLength(2);
    expect(written[0]).toMatchObject({
      eventType: 'production_order_bulk_resolved_without_production',
      entityId: ids.ready,
      payload: {
        reason: 'processor_not_in_use',
        resolutionState: 'resolved_without_production',
      },
    });
    expect(written[0]?.payload).not.toHaveProperty('note');
    expect(written[1]).toMatchObject({
      eventType: 'production_order_backlog_bulk_resolution_committed',
      idempotencyKey: 'bulk-resolution-1',
      payload: { candidateCount: 3, resolvedCount: 1 },
    });
  });

  it('rejects version drift before writing any order', async () => {
    const repository = makeRepository({
      hasMore: false,
      orders: [snapshotOrder(ids.ready)],
    });
    const reviewed = await preview(repository.repo);
    repository.mutateOrder(ids.ready, { productionVersion: 3 });

    await expect(commit(repository.repo, reviewed)).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_order_backlog_preview_stale' },
    });
    expect(repository.resolveOrder).not.toHaveBeenCalled();
    expect(repository.appendWorkEvent).not.toHaveBeenCalled();
  });

  it('rolls back the entire bounded commit when one versioned write conflicts', async () => {
    const repository = makeRepository(
      {
        hasMore: false,
        orders: [snapshotOrder(ids.ready), snapshotOrder(ids.review)],
      },
      { failOrderId: ids.review },
    );
    const reviewed = await preview(repository.repo);

    await expect(commit(repository.repo, reviewed)).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_order_backlog_commit_conflict' },
    });
    expect(
      repository.stored.orders.map((order) => order.resolutionState),
    ).toEqual(['open', 'open']);
  });

  it('replays the one bulk result without locking or writing again', async () => {
    const repository = makeRepository({
      hasMore: false,
      orders: [snapshotOrder(ids.ready)],
    });
    const reviewed = await preview(repository.repo);
    const run = makeCommitProductionOrderBacklog({
      repo: repository.repo,
      policy: allowPolicy,
      clock: { now: () => now },
      ids: makeIds(),
    });
    const command = {
      ...previewCommand,
      note: null,
      previewHash: reviewed.previewHash,
      idempotencyKey: 'bulk-resolution-replay',
      actorId: ids.actor,
    };

    const first = await run(command);
    const second = await run(command);

    expect(first).toMatchObject({ tag: 'ok', value: { replayed: false } });
    expect(second).toMatchObject({ tag: 'ok', value: { replayed: true } });
    expect(repository.lockLocationScheduling).toHaveBeenCalledTimes(1);
    expect(repository.resolveOrder).toHaveBeenCalledTimes(1);
  });

  it('advances through more than one bounded page after committing page one', async () => {
    const repository = makeRepository({
      hasMore: false,
      orders: [
        snapshotOrder(ids.ready),
        snapshotOrder(ids.review),
        snapshotOrder(ids.kept),
        snapshotOrder(ids.resolved),
      ],
    });
    const runPreview = makePreviewProductionOrderBacklog({
      repo: repository.repo,
      policy: allowPolicy,
      clock: { now: () => now },
    });
    const first = await runPreview({ ...previewCommand, maxOrders: 2 });
    expect(first).toMatchObject({
      tag: 'ok',
      value: {
        candidateCount: 2,
        hasMore: true,
      },
    });
    if (first.tag === 'err') throw first.error;
    expect(first.value.nextCursor).not.toBeNull();

    const firstCommit = await commit(repository.repo, first.value, {
      maxOrders: 2,
      idempotencyKey: 'bulk-resolution-page-1',
    });
    expect(firstCommit).toMatchObject({
      tag: 'ok',
      value: {
        resolvedCount: 2,
        nextCursor: first.value.nextCursor,
      },
    });
    if (firstCommit.tag === 'err') throw firstCommit.error;

    const second = await runPreview({
      ...previewCommand,
      maxOrders: 2,
      cursor: firstCommit.value.nextCursor,
    });
    expect(second).toMatchObject({
      tag: 'ok',
      value: {
        candidateCount: 2,
        hasMore: false,
        cursor: first.value.nextCursor,
        nextCursor: null,
      },
    });
    if (second.tag === 'err') throw second.error;
    expect(
      second.value.groups.readyToArchive.map((order) => order.orderId),
    ).toEqual([ids.kept, ids.resolved]);

    await expect(
      commit(repository.repo, second.value, {
        maxOrders: 2,
        cursor: firstCommit.value.nextCursor,
        idempotencyKey: 'bulk-resolution-page-2',
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { resolvedCount: 2, nextCursor: null },
    });
    expect(repository.resolveOrder).toHaveBeenCalledTimes(4);
  });

  it('rejects tampered and scope-mismatched cursors before loading a page', async () => {
    const repository = makeRepository({
      hasMore: false,
      orders: [
        snapshotOrder(ids.ready),
        snapshotOrder(ids.review),
        snapshotOrder(ids.kept),
      ],
    });
    const runPreview = makePreviewProductionOrderBacklog({
      repo: repository.repo,
      policy: allowPolicy,
      clock: { now: () => now },
    });
    const first = await runPreview({ ...previewCommand, maxOrders: 2 });
    if (first.tag === 'err' || first.value.nextCursor === null)
      throw new Error('Expected a next page.');

    const tampered = `${first.value.nextCursor.slice(0, -1)}${
      first.value.nextCursor.endsWith('a') ? 'b' : 'a'
    }` as typeof first.value.nextCursor;
    await expect(
      runPreview({ ...previewCommand, maxOrders: 2, cursor: tampered }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_order_backlog_cursor_invalid' },
    });
    await expect(
      runPreview({
        ...previewCommand,
        reason: 'duplicate_or_test',
        maxOrders: 2,
        cursor: first.value.nextCursor,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_order_backlog_cursor_invalid' },
    });
    expect(repository.repo.loadSnapshot).toHaveBeenCalledTimes(1);
  });
});
