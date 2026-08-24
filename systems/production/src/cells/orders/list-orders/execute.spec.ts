import { proveOperation } from '@pressly/testkit/operation-proof';
import { listOrdersCellDeclaration } from './cell.ts';
import { describe, expect, it, vi } from 'vitest';
import { makeExecuteListOrders } from './execute.ts';
import type { ListOrdersExpectedFailure } from './types.ts';

const asOf = new Date('2026-08-21T14:00:00.000Z');

const expectedFailureCases: readonly Readonly<{
  name: string;
  kind: 'invalid_cursor' | 'location_not_found';
  failure: ListOrdersExpectedFailure;
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
      code: 'production_order_cursor_invalid',
      message: 'The production-order cursor is invalid.',
      safeMessage: 'The production-order cursor is invalid.',
    },
  },
];

describe('list-orders executor', () => {
  proveOperation({
    operationId: 'production.list-orders.v1',
    declaration: listOrdersCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'passes one clock instant through repository and response',
        proves: ['executor-success'],
        run: async () => {
          const list = vi.fn(async (_input, receivedAsOf: Date) => ({
            kind: 'found' as const,
            page: { items: [], nextCursor: null, asOf: receivedAsOf },
          }));
          const execute = makeExecuteListOrders({
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
      const execute = makeExecuteListOrders({
        repo: { list: async () => ({ kind }) },
        clock: { now: () => asOf },
      });
      await expect(
        execute({ locationId: 'location-1', limit: 50 }),
      ).resolves.toEqual({ kind: 'failure', failure });
    },
  );
});
