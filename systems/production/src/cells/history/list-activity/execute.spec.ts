import { proveOperation } from '@pressly/testkit/operation-proof';
import { listHistoryActivityCellDeclaration } from './cell.ts';
import { isAppError } from '@pressly/errors/app-error';
import { invariantViolationError } from '@pressly/errors/factories';
import { describe, expect, it, vi } from 'vitest';
import { makeExecuteListHistoryActivity } from './execute.ts';
import type {
  HistoryActivityEntry,
  ListHistoryActivityExpectedFailure,
  ListHistoryActivityRepository,
} from './types.ts';

const asOf = new Date('2026-08-21T15:00:00.000Z');
const input = { locationId: 'location-1', limit: 50 } as const;
const item: HistoryActivityEntry = {
  id: '10000000-0000-4000-8000-000000000001',
  eventType: 'stage_completed',
  entityType: 'stage_run',
  entityId: '10000000-0000-4000-8000-000000000002',
  actor: {
    id: '10000000-0000-4000-8000-000000000003',
    kind: 'user',
    displayName: 'Alex',
  },
  expectedVersion: 2,
  productionRunId: '10000000-0000-4000-8000-000000000004',
  resolutionAction: null,
  summary: 'Production stage completed',
  details: {
    kind: 'stage',
    action: 'completed',
    version: 3,
    machineIds: [],
    timingConfirmationRecorded: false,
  },
  occurredAt: new Date('2026-08-21T12:00:00.000Z'),
};

const expectedFailureCases: readonly Readonly<{
  name: string;
  kind: 'invalid_cursor' | 'location_not_found';
  failure: ListHistoryActivityExpectedFailure;
}>[] = [
  {
    name: 'missing location',
    kind: 'location_not_found',
    failure: {
      tag: 'ProductionFailure',
      kind: 'not_found',
      code: 'production_location_not_found',
      message: 'The production location was not found.',
      safeMessage: 'The production location was not found.',
    },
  },
  {
    name: 'invalid cursor',
    kind: 'invalid_cursor',
    failure: {
      tag: 'ProductionFailure',
      kind: 'validation',
      classification: 'malformed',
      code: 'production_history_cursor_invalid',
      message: 'The production-history cursor is invalid for these filters.',
      safeMessage:
        'The production-history cursor is invalid for these filters.',
    },
  },
];

describe('list-history-activity executor', () => {
  proveOperation({
    operationId: 'production.list-history-activity.v1',
    declaration: listHistoryActivityCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'preserves one clock-before-read value for the snapshot and result',
        proves: ['executor-success'],
        run: async () => {
          const timing: string[] = [];
          const now = vi.fn(() => {
            timing.push('clock');
            return asOf;
          });
          const list = vi.fn<ListHistoryActivityRepository['list']>(
            async (_input, receivedAsOf) => {
              timing.push('read');
              return {
                kind: 'found',
                page: {
                  items: [item],
                  nextCursor: 'next-page',
                  asOf: receivedAsOf,
                },
              };
            },
          );
          const execute = makeExecuteListHistoryActivity({
            repo: { list },
            clock: { now },
          });

          await expect(execute(input)).resolves.toMatchObject({
            kind: 'success',
            value: {
              items: [
                { id: item.id, occurredAt: item.occurredAt.toISOString() },
              ],
              nextCursor: 'next-page',
              asOf: asOf.toISOString(),
            },
          });
          expect(timing).toEqual(['clock', 'read']);
          expect(now).toHaveBeenCalledOnce();
          expect(list).toHaveBeenCalledWith(input, asOf);
        },
      },
    ],
  });

  it.each(expectedFailureCases)(
    'returns the exact typed $name failure',
    async ({ kind, failure }) => {
      const execute = makeExecuteListHistoryActivity({
        repo: { list: async () => ({ kind }) },
        clock: { now: () => asOf },
      });

      await expect(execute(input)).resolves.toEqual({
        kind: 'failure',
        failure,
      });
    },
  );

  it('maps unknown persistence faults to the exact current database error', async () => {
    const execute = makeExecuteListHistoryActivity({
      repo: {
        list: async () => {
          throw { fault: 'database offline' };
        },
      },
      clock: { now: () => asOf },
    });

    await expect(execute(input)).rejects.toMatchObject({
      tag: 'AppError',
      kind: 'DatabaseError',
      code: 'production_history_activity_list_failed',
      message: 'Production activity history could not be loaded.',
      safeMessage: 'Production activity history could not be loaded.',
      status: 503,
    });
  });

  it('preserves an owned AppError from the clock or repository', async () => {
    const owned = invariantViolationError({
      code: 'history_projection_invalid',
      message: 'History projection is invalid.',
    });
    for (const dependencies of [
      {
        repo: { list: async () => Promise.reject(owned) },
        clock: { now: () => asOf },
      },
      {
        repo: {
          list: async () => ({
            kind: 'found' as const,
            page: { items: [], nextCursor: null, asOf },
          }),
        },
        clock: {
          now: () => {
            throw owned;
          },
        },
      },
    ]) {
      const execute = makeExecuteListHistoryActivity(dependencies);
      try {
        await execute(input);
        expect.unreachable('owned error should throw');
      } catch (error) {
        expect(isAppError(error)).toBe(true);
        expect(error).toBe(owned);
      }
    }
  });
});
