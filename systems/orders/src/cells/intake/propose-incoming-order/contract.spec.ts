import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it } from 'vitest';
import { proposeIncomingOrderCellDeclaration } from './cell.ts';
import { proposeIncomingOrderContract } from './contract.ts';
import type { ProposeIncomingOrderCommand } from './types.ts';

const command = (): ProposeIncomingOrderCommand => ({
  context: {
    origin: 'external_orders_adapter',
    principal: { kind: 'system', id: 'external-orders' },
  },
  source: 'cents',
  externalOrderId: 'source-order-1',
  proposalKind: 'submitted_order',
  snapshot: {
    customer: {
      externalUserId: 'customer-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      businessName: null,
      phone: null,
      email: 'ada@example.test',
      normalizedPayload: { id: 'customer-1' },
    },
    displayNumber: 'P-1001',
    dueAt: new Date('2026-08-23T20:00:00.000Z'),
    currency: 'USD',
    totalAmountCents: 3_000,
    balanceDueCents: 3_000,
    items: [
      {
        lineKey: 'laundry',
        itemType: 'service',
        code: 'wash_fold',
        description: 'Wash and fold',
        quantity: 18,
        unit: 'lb',
        unitPriceCents: 200,
        totalAmountCents: 3_600,
        sourceMetadata: { service: 'wash_fold' },
      },
    ],
    fulfillment: {
      typeCode: 'wash_fold',
      locationId: 'east',
      estimatedWeightLbs: 18,
      estimatedWeightSource: 'source_estimate',
    },
  },
  revision: {
    at: new Date('2026-08-22T15:59:00.000Z'),
    hash: 'a'.repeat(64),
    adapterVersion: 'external-orders-v1',
    observedAt: new Date('2026-08-22T16:00:00.000Z'),
    normalizedPayload: { order: { id: 'source-order-1' } },
  },
});

proveOperation({
  operationId: 'orders.propose-incoming-order.v1',
  declaration: proposeIncomingOrderCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'preserves the immutable source snapshot and typed timestamps on the wire',
      proves: ['contract'],
      run: () => {
        const encoded = proposeIncomingOrderContract.input.encode(command());
        expect(proposeIncomingOrderContract.input.decode(encoded)).toEqual({
          kind: 'valid',
          value: command(),
        });
        expect(
          proposeIncomingOrderContract.input.decode({
            ...(encoded as Record<string, unknown>),
            undeclared: true,
          }),
        ).toMatchObject({ kind: 'invalid' });
      },
    },
  ],
});

describe('propose incoming Order contract', () => {
  it('round-trips the strict serialized command and typed dates', () => {
    const value = command();
    const encoded = proposeIncomingOrderContract.input.encode(value);
    expect(encoded).toMatchObject({
      snapshot: { dueAt: '2026-08-23T20:00:00.000Z' },
      revision: {
        at: '2026-08-22T15:59:00.000Z',
        observedAt: '2026-08-22T16:00:00.000Z',
      },
    });
    expect(proposeIncomingOrderContract.input.decode(encoded)).toEqual({
      kind: 'valid',
      value,
    });
  });

  it('rejects unknown fields, non-JSON values and malformed timestamps', () => {
    const encoded = proposeIncomingOrderContract.input.encode(command()) as {
      snapshot: Record<string, unknown>;
      revision: Record<string, unknown>;
    };
    expect(
      proposeIncomingOrderContract.input.decode({
        ...encoded,
        extra: true,
      }),
    ).toMatchObject({ kind: 'invalid' });
    expect(
      proposeIncomingOrderContract.input.decode({
        ...encoded,
        revision: { ...encoded.revision, at: 'not-a-date' },
      }),
    ).toMatchObject({ kind: 'invalid' });
    expect(
      proposeIncomingOrderContract.input.decode({
        ...encoded,
        revision: {
          ...encoded.revision,
          normalizedPayload: { value: Number.NaN },
        },
      }),
    ).toMatchObject({ kind: 'invalid' });
  });

  it('round-trips every public outcome and the expected failure', () => {
    for (const outcome of [
      'proposed',
      'existing_proposal',
      'existing_order',
      'source_closed',
    ] as const) {
      const value = {
        proposalId:
          outcome === 'existing_order'
            ? null
            : '10000000-0000-4000-8000-000000000001',
        version: outcome === 'proposed' ? 1 : null,
        replayed: outcome !== 'proposed',
        outcome,
      };
      const encoded = proposeIncomingOrderContract.output.encode(value);
      expect(proposeIncomingOrderContract.output.decode(encoded)).toEqual({
        kind: 'valid',
        value,
      });
    }

    const failure = {
      kind: 'validation' as const,
      code: 'incoming_order_proposal_invalid' as const,
      message: 'Invalid proposal.',
    };
    expect(
      proposeIncomingOrderContract.failure.decode(
        proposeIncomingOrderContract.failure.encode(failure),
      ),
    ).toEqual({ kind: 'valid', value: failure });
  });
});
