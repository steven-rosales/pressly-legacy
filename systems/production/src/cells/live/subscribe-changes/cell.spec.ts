import { proveOperation } from '@pressly/testkit/operation-proof';
import { defineEventStreamCatalog } from '@pressly/cells';
import { describe, expect, it } from 'vitest';
import {
  makeSubscribeProductionChangesCell,
  subscribeProductionChangesCellDeclaration,
} from './cell.ts';

describe('subscribe production changes cell', () => {
  it('declares the exact selected operation and event-stream protocol', () => {
    expect(subscribeProductionChangesCellDeclaration).toMatchObject({
      id: 'production.subscribe-changes.v1',
      kind: 'subscription',
      authorization: {
        capability: 'production:read',
        timing: 'before-input',
      },
      consistency: { transaction: 'none', concurrency: 'none' },
      idempotency: { required: false },
      observability: { operation: 'production.subscribe_changes' },
    });
    expect(subscribeProductionChangesCellDeclaration.surfaces).toEqual([
      expect.objectContaining({
        kind: 'event-stream',
        method: 'GET',
        path: '/production/locations/:locationId/events',
        retryMs: 3_000,
        eventTypes: ['ready', 'change', 'resync'],
      }),
    ]);
  });

  proveOperation({
    operationId: 'production.subscribe-changes.v1',
    declaration: subscribeProductionChangesCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'builds an executable stream catalog without entering the finite HTTP catalog',
        proves: ['protocol'],
        run: async () => {
          const cell = makeSubscribeProductionChangesCell({
            source: {
              subscribe: () => () => undefined,
              currentRevision: async () => 3,
            },
          });
          const catalog = defineEventStreamCatalog([cell]);

          expect(catalog.entries).toHaveLength(1);
          expect(catalog.entries[0]?.operationId).toBe(
            'production.subscribe-changes.v1',
          );
          const decoded = catalog.entries[0]?.decodeRequest({
            params: { locationId: 'east' },
            query: {},
            headers: {},
            body: undefined,
            context: {},
          });
          expect(decoded).toEqual({
            kind: 'valid',
            value: { locationId: 'east' },
          });
          if (decoded?.kind !== 'valid') return;
          const outcome = await catalog.entries[0]?.open(decoded.value);
          expect(outcome).toMatchObject({
            kind: 'success',
            value: { ready: { revision: 3 } },
          });
          if (outcome?.kind === 'success') await outcome.value.close();
        },
      },
    ],
  });
});
