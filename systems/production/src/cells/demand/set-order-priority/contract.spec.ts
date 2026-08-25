import { proveOperation } from '@pressly/testkit/operation-proof';
import { setOrderPriorityCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { setOrderPriorityContract } from './contract.ts';

const params = {
  locationId: 'location-1',
  productionOrderId: '00000000-0000-4000-8000-000000000101',
};

describe('set order priority contract', () => {
  proveOperation({
    operationId: 'production.set-order-priority.v1',
    declaration: setOrderPriorityCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'decodes the deployed strict request and trusted actor scope',
        proves: ['contract'],
        run: () => {
          expect(
            setOrderPriorityContract.input.decode({
              params,
              body: {
                priority: true,
                expectedVersion: 2,
                idempotencyKey: 'priority-command-1',
              },
              actorId: '00000000-0000-4000-8000-000000000201',
            }),
          ).toEqual({
            kind: 'valid',
            value: {
              ...params,
              actorId: '00000000-0000-4000-8000-000000000201',
              priority: true,
              expectedVersion: 2,
              idempotencyKey: 'priority-command-1',
            },
          });
        },
      },
    ],
  });

  it('preserves body and parameter validation locations', () => {
    const decoded = setOrderPriorityContract.input.decode({
      params: { ...params, productionOrderId: 'not-an-id' },
      body: {
        priority: 'yes',
        expectedVersion: 0,
        idempotencyKey: 'short',
        undeclared: true,
      },
      actorId: '',
    });

    expect(decoded).toMatchObject({ kind: 'invalid' });
    if (decoded.kind === 'invalid')
      expect(decoded.issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining(['params', 'body', 'actorId']),
      );
  });

  it('round-trips the serialized success result', () => {
    const result = {
      entityId: params.productionOrderId,
      version: 3,
      replayed: false,
    };
    expect(
      setOrderPriorityContract.output.decode(
        setOrderPriorityContract.output.encode(result),
      ),
    ).toEqual({ kind: 'valid', value: result });
  });
});
