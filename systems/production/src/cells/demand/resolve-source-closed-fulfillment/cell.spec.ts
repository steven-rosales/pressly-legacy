import { describe, expect, it } from 'vitest';
import { resolveSourceClosedFulfillmentCellDeclaration } from './cell.ts';

describe('resolve source-closed fulfillment cell declaration', () => {
  it('declares a selected headless command with delegated idempotency', () => {
    expect(resolveSourceClosedFulfillmentCellDeclaration).toMatchObject({
      id: 'production.resolve-source-closed-fulfillment.v1',
      kind: 'command',
      authentication: 'none',
      authorization: null,
      consistency: { transaction: 'none', concurrency: 'none' },
      idempotency: { required: true },
      surfaces: [],
      emits: [],
      consumes: [],
      retry: null,
      observability: {
        operation: 'production.resolve_source_closed_fulfillment',
      },
    });
    expect(
      resolveSourceClosedFulfillmentCellDeclaration.idempotency.key?.({
        locationId: 'location-1',
        fulfillmentId: 'fulfillment-1',
        actorId: 'actor-1',
        idempotencyKey: 'source-close-1',
      }),
    ).toBe('source-close-1');
  });
});
