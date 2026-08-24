import { proveOperation } from '@pressly/testkit/operation-proof';
import { listHistoryRunsCellDeclaration } from './cell.ts';
import { describe, expect, it, vi } from 'vitest';
import { makeExecuteListHistoryRuns } from './execute.ts';
import type { ListHistoryRunsExpectedFailure } from './types.ts';

const asOf = new Date('2026-08-21T16:00:00.000Z');

const expectedFailureCases: readonly Readonly<{
  name: string;
  kind: 'invalid_cursor' | 'location_not_found';
  failure: ListHistoryRunsExpectedFailure;
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

describe('list-history-runs executor', () => {
  proveOperation({
    operationId: 'production.list-history-runs.v1',
    declaration: listHistoryRunsCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'passes one clock instant into the repository snapshot',
        proves: ['executor-success'],
        run: async () => {
          const list = vi.fn(async (_input, receivedAsOf: Date) => ({
            kind: 'found' as const,
            page: { items: [], nextCursor: null, asOf: receivedAsOf },
          }));
          const execute = makeExecuteListHistoryRuns({
            repo: { list },
            clock: { now: () => asOf },
          });
          await expect(
            execute({ locationId: 'location-1', limit: 50 }),
          ).resolves.toEqual({
            kind: 'success',
            value: { items: [], nextCursor: null, asOf: asOf.toISOString() },
          });
          expect(list).toHaveBeenCalledWith(
            { locationId: 'location-1', limit: 50 },
            asOf,
          );
        },
      },
    ],
  });

  it.each(expectedFailureCases)(
    'returns the exact typed $name failure',
    async ({ kind, failure }) => {
      const execute = makeExecuteListHistoryRuns({
        repo: { list: async () => ({ kind }) },
        clock: { now: () => asOf },
      });
      await expect(
        execute({ locationId: 'location-1', limit: 50 }),
      ).resolves.toEqual({ kind: 'failure', failure });
    },
  );
});
