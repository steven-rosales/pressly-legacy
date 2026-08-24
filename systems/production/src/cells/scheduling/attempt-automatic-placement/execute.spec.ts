import { isAppError } from '@pressly/errors/app-error';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it, vi } from 'vitest';
import { attemptAutomaticPlacementCellDeclaration } from './cell.ts';
import {
  makeExecuteAttemptAutomaticPlacement,
  type AttemptAutomaticPlacementRepository,
  type AttemptAutomaticPlacementTransactionRepository,
} from './execute.ts';
import type {
  AttemptAutomaticPlacementCommand,
  AttemptAutomaticPlacementExpectedFailure,
} from './types.ts';

const command: AttemptAutomaticPlacementCommand = {
  locationId: 'location-1',
  productionOrderId: 'order-1',
  actorId: 'actor-1',
  authorizedAction: 'production:queue',
  idempotencyKey: 'attempt-1',
};

const placed = {
  status: 'placed' as const,
  mode: 'automatic' as const,
  productionRunId: 'run-1',
  productionOrderId: 'order-1',
  productionBatchId: 'batch-1',
  createdBatch: false,
  affectedBatchIds: ['batch-1'],
  queueVersion: 5,
  proposalHash: 'a'.repeat(64),
  plannedCompletionAt: '2026-08-22T20:00:00.000Z',
  overtimeMinutes: 0,
  replayed: false,
};

const makeRepository = (
  overrides: Partial<AttemptAutomaticPlacementTransactionRepository> = {},
) => {
  const calls: string[] = [];
  const operations: AttemptAutomaticPlacementTransactionRepository = {
    lockLocationScheduling: vi.fn(async () => {
      calls.push('lock');
    }),
    findStartedRuns: vi.fn(async () => {
      calls.push('runs');
      return [];
    }),
    recordPendingRunResolution: vi.fn(async () => {
      calls.push('record');
      return 'recorded' as const;
    }),
    placeAutomatically: vi.fn(async () => {
      calls.push('place');
      return { kind: 'success' as const, value: placed };
    }),
    ...overrides,
  };
  const repo: AttemptAutomaticPlacementRepository = {
    transaction: (work) => work(operations),
  };
  return {
    operations,
    calls,
    repo,
  };
};

describe('attempt automatic placement executor', () => {
  proveOperation({
    operationId: 'production.attempt-automatic-placement.v1',
    declaration: attemptAutomaticPlacementCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'records an awaiting-run outcome atomically',
        proves: ['executor-success'],
        run: async () => {
          const repository = makeRepository();
          const now = vi.fn(() => new Date('2026-08-22T15:00:00.000Z'));
          const execute = makeExecuteAttemptAutomaticPlacement({
            repo: repository.repo,
            clock: { now },
          });

          await expect(execute(command)).resolves.toEqual({
            kind: 'success',
            value: null,
          });
          expect(repository.calls).toEqual(['lock', 'runs', 'record']);
          expect(
            repository.operations.recordPendingRunResolution,
          ).toHaveBeenCalledWith({
            locationId: command.locationId,
            productionOrderId: command.productionOrderId,
            actorId: command.actorId,
            idempotencyKey: command.idempotencyKey,
            placement: {
              status: 'awaiting_run',
              reason: 'no_started_run',
              message: 'This order is waiting for a production run to start.',
            },
            now: new Date('2026-08-22T15:00:00.000Z'),
          });
          expect(
            repository.operations.placeAutomatically,
          ).not.toHaveBeenCalled();
          expect(now).toHaveBeenCalledOnce();
        },
      },
    ],
  });

  it('records the sorted ambiguous-run state without delegating', async () => {
    const repository = makeRepository({
      findStartedRuns: vi.fn(async () => [
        { productionRunId: 'run-b', queueVersion: 2 },
        { productionRunId: 'run-a', queueVersion: 1 },
      ]),
    });
    const execute = makeExecuteAttemptAutomaticPlacement({
      repo: repository.repo,
      clock: { now: () => new Date('2026-08-22T15:00:00.000Z') },
    });

    await expect(execute(command)).resolves.toEqual({
      kind: 'success',
      value: null,
    });
    expect(
      repository.operations.recordPendingRunResolution,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        placement: expect.objectContaining({
          status: 'ambiguous_run',
          candidateProductionRunIds: ['run-a', 'run-b'],
        }),
      }),
    );
    expect(repository.operations.placeAutomatically).not.toHaveBeenCalled();
  });

  it('delegates one run inside the same transaction and preserves queue authority', async () => {
    const placeAutomatically = vi.fn(async () => ({
      kind: 'success' as const,
      value: { ...placed, replayed: true },
    }));
    const repository = makeRepository({
      findStartedRuns: vi.fn(async () => [
        { productionRunId: 'run-1', queueVersion: 4 },
      ]),
      placeAutomatically,
    });
    const now = vi.fn(() => new Date());
    const execute = makeExecuteAttemptAutomaticPlacement({
      repo: repository.repo,
      clock: { now },
    });

    await expect(execute(command)).resolves.toEqual({
      kind: 'success',
      value: { ...placed, replayed: true },
    });
    expect(placeAutomatically).toHaveBeenCalledWith({
      ...command,
      productionRunId: 'run-1',
      expectedQueueVersion: 4,
    });
    expect(
      repository.operations.recordPendingRunResolution,
    ).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
  });

  it('propagates delegated typed failure without converting it', async () => {
    const expected: AttemptAutomaticPlacementExpectedFailure = {
      kind: 'conflict',
      code: 'production_idempotency_conflict',
      message: 'Conflict.',
      safeMessage: 'Conflict.',
    };
    const repository = makeRepository({
      findStartedRuns: vi.fn(async () => [
        { productionRunId: 'run-1', queueVersion: 4 },
      ]),
      placeAutomatically: vi.fn(async () => ({
        kind: 'failure' as const,
        failure: expected,
      })),
    });
    const execute = makeExecuteAttemptAutomaticPlacement({
      repo: repository.repo,
      clock: { now: () => new Date() },
    });

    await expect(execute(command)).resolves.toEqual({
      kind: 'failure',
      failure: expected,
    });
  });

  it('returns a typed conflict for divergent pending-placement key reuse', async () => {
    const repository = makeRepository({
      recordPendingRunResolution: vi.fn(async () => 'conflict' as const),
    });
    const execute = makeExecuteAttemptAutomaticPlacement({
      repo: repository.repo,
      clock: { now: () => new Date('2026-08-22T15:00:00.000Z') },
    });

    await expect(execute(command)).resolves.toEqual({
      kind: 'failure',
      failure: {
        kind: 'conflict',
        code: 'production_idempotency_conflict',
        message:
          'The idempotency key belongs to a different placement attempt.',
        safeMessage: 'The idempotency key belongs to a different request.',
      },
    });
  });

  it('maps unknown transaction faults to the stable database error', async () => {
    const repository = makeRepository({
      lockLocationScheduling: vi.fn(async () => {
        throw { driver: 'failed' };
      }),
    });
    const execute = makeExecuteAttemptAutomaticPlacement({
      repo: repository.repo,
      clock: { now: () => new Date() },
    });

    try {
      await execute(command);
      expect.unreachable('Unknown faults must throw.');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      expect(error).toMatchObject({
        code: 'production_order_placement_failed',
        status: 503,
      });
    }
  });
});
