import { proveOperation } from '@pressly/testkit/operation-proof';
import { resolveSourceClosedFulfillmentCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { resolveSourceClosedFulfillmentContract } from './contract.ts';
import type {
  ResolveSourceClosedFulfillmentCommand,
  ResolveSourceClosedFulfillmentResult,
} from './types.ts';

const command: ResolveSourceClosedFulfillmentCommand = {
  locationId: 'location-1',
  fulfillmentId: '10000000-0000-4000-8000-000000000001',
  actorId: '10000000-0000-4000-8000-000000000002',
  idempotencyKey: 'source-close-resolution-1',
};

describe('resolve source-closed fulfillment contract', () => {
  proveOperation({
    operationId: 'production.resolve-source-closed-fulfillment.v1',
    declaration: resolveSourceClosedFulfillmentCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'round-trips the complete source-neutral command',
        proves: ['contract'],
        run: () => {
          const serialized =
            resolveSourceClosedFulfillmentContract.input.encode(command);
          expect(serialized).toEqual(command);
          expect(
            resolveSourceClosedFulfillmentContract.input.decode(serialized),
          ).toEqual({ kind: 'valid', value: command });
        },
      },
    ],
  });

  it.each([
    {
      outcome: 'resolved',
      locationId: command.locationId,
      fulfillmentId: command.fulfillmentId,
      productionOrderId: '10000000-0000-4000-8000-000000000003',
      version: 4,
      replayed: true,
    },
    {
      outcome: 'not_found',
      locationId: command.locationId,
      fulfillmentId: command.fulfillmentId,
    },
    {
      outcome: 'already_resolved',
      locationId: command.locationId,
      fulfillmentId: command.fulfillmentId,
      productionOrderId: '10000000-0000-4000-8000-000000000003',
      version: 4,
    },
    {
      outcome: 'review_required',
      locationId: command.locationId,
      fulfillmentId: command.fulfillmentId,
      productionOrderId: '10000000-0000-4000-8000-000000000003',
      version: 3,
      reason: 'operational_participation',
    },
  ] satisfies readonly ResolveSourceClosedFulfillmentResult[])(
    'round-trips $outcome',
    (value) => {
      const serialized =
        resolveSourceClosedFulfillmentContract.output.encode(value);
      expect(
        resolveSourceClosedFulfillmentContract.output.decode(serialized),
      ).toEqual({ kind: 'valid', value });
    },
  );

  it('rejects incomplete commands and malformed results', () => {
    expect(
      resolveSourceClosedFulfillmentContract.input.decode({
        ...command,
        locationId: '',
        actorId: null,
      }),
    ).toMatchObject({
      kind: 'invalid',
      issues: [{ path: ['locationId'] }, { path: ['actorId'] }],
    });
    expect(
      resolveSourceClosedFulfillmentContract.output.decode({
        outcome: 'resolved',
        locationId: command.locationId,
        fulfillmentId: command.fulfillmentId,
        productionOrderId: 'order-1',
        version: 0,
        replayed: 'yes',
      }),
    ).toMatchObject({ kind: 'invalid' });
    expect(
      resolveSourceClosedFulfillmentContract.failure.decode({}),
    ).toMatchObject({ kind: 'invalid' });
  });
});
