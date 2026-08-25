import { proveOperation } from '@pressly/testkit/operation-proof';
import { loadBoardCellDeclaration } from './cell.ts';
import { isAppError } from '@pressly/errors/app-error';
import { invariantViolationError } from '@pressly/errors/factories';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import type { BoardProjection } from '../../../read-models/production-board/model.ts';
import { makeExecuteLoadBoard } from './execute.ts';
import type { LoadBoardRepository } from './types.ts';

const ids = {
  shift: '32000000-0000-4000-8000-000000000001',
  run: '32000000-0000-4000-8000-000000000002',
} as const;
const asOf = new Date('2026-08-21T15:00:00.000Z');
const input = {
  locationId: 'location-1',
  productionRunId: ids.run,
} as const;
const projection: BoardProjection = {
  board: {
    productionShift: {
      id: ids.shift,
      locationId: input.locationId,
      startsAt: new Date('2026-08-21T12:00:00.000Z'),
      endsAt: new Date('2026-08-21T20:00:00.000Z'),
      timezone: 'America/New_York',
      effectiveFolderCount: 2,
      status: 'open',
      version: 1,
    },
    productionRun: {
      id: ids.run,
      productionShiftId: ids.shift,
      status: 'started',
      queueVersion: 1,
      plannedCompletionAt: new Date('2026-08-21T18:00:00.000Z'),
      overtimeAcknowledgement: null,
      version: 1,
    },
    batches: [],
    eligibleOrders: [],
    asOf,
  },
  stageNextActionContexts: [],
  orders: [],
};

describe('load-board executor', () => {
  it('consumes the canonical Production board projection without adaptation', () => {
    expectTypeOf<
      Awaited<ReturnType<LoadBoardRepository['load']>>
    >().toEqualTypeOf<BoardProjection | null>();
  });

  proveOperation({
    operationId: 'production.load-board.v1',
    declaration: loadBoardCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'observes one clock value before the repository read and serializes it',
        proves: ['executor-success'],
        run: async () => {
          const timing: string[] = [];
          const load = vi.fn<LoadBoardRepository['load']>(
            async (_locationId, _runId, receivedAsOf) => {
              timing.push('read');
              return {
                ...projection,
                board: { ...projection.board, asOf: receivedAsOf },
              };
            },
          );
          const execute = makeExecuteLoadBoard({
            repo: { load },
            clock: {
              now: () => {
                timing.push('clock');
                return asOf;
              },
            },
            policy: productionRules,
          });

          await expect(execute(input)).resolves.toMatchObject({
            kind: 'success',
            value: {
              productionRun: { id: ids.run },
              batches: [],
              eligibleOrders: [],
              asOf: asOf.toISOString(),
            },
          });
          expect(timing).toEqual(['clock', 'read']);
          expect(load).toHaveBeenCalledWith(input.locationId, ids.run, asOf);
        },
      },
    ],
  });

  it('returns the exact missing-board failure', async () => {
    const execute = makeExecuteLoadBoard({
      repo: { load: async () => null },
      clock: { now: () => asOf },
      policy: productionRules,
    });

    await expect(execute(input)).resolves.toEqual({
      kind: 'failure',
      failure: {
        tag: 'ProductionFailure',
        kind: 'not_found',
        code: 'production_board_not_found',
        message: 'The production board was not found.',
        safeMessage: 'The production board was not found.',
      },
    });
  });

  it('maps unknown faults and preserves owned AppErrors', async () => {
    const unknown = makeExecuteLoadBoard({
      repo: {
        load: async () => {
          throw { fault: 'database unavailable' };
        },
      },
      clock: { now: () => asOf },
      policy: productionRules,
    });
    await expect(unknown(input)).rejects.toMatchObject({
      tag: 'AppError',
      kind: 'DatabaseError',
      code: 'production_board_load_failed',
      message: 'The production board could not be loaded.',
      safeMessage: 'The production board could not be loaded.',
      status: 503,
    });

    const owned = invariantViolationError({
      code: 'production_board_projection_invalid',
      message: 'The board projection is invalid.',
    });
    const preserve = makeExecuteLoadBoard({
      repo: { load: async () => Promise.reject(owned) },
      clock: { now: () => asOf },
      policy: productionRules,
    });
    try {
      await preserve(input);
      expect.unreachable('owned error should throw');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      expect(error).toBe(owned);
    }
  });
});
