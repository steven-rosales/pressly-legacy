import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it } from 'vitest';
import { closeIncomingOrderSourceCellDeclaration } from './cell.ts';
import { closeIncomingOrderSourceContract } from './contract.ts';
import type { CloseIncomingOrderSourceCommand } from './types.ts';

const command = (): CloseIncomingOrderSourceCommand => ({
  context: {
    origin: 'external_orders_adapter',
    principal: { kind: 'system', id: 'external-orders' },
  },
  source: 'cents',
  externalOrderId: 'source-order-1',
  terminalCode: 'completed',
  revision: {
    at: new Date('2026-08-22T16:05:00.000Z'),
    hash: 'b'.repeat(64),
    adapterVersion: 'external-orders-v1',
    observedAt: new Date('2026-08-22T16:05:01.000Z'),
    normalizedPayload: {
      order: { id: 'source-order-1', state: 'completed' },
    },
  },
});

proveOperation({
  operationId: 'orders.close-incoming-order-source.v1',
  declaration: closeIncomingOrderSourceCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'preserves strict source-terminal evidence and typed conflict data on the wire',
      proves: ['contract'],
      run: () => {
        const encoded =
          closeIncomingOrderSourceContract.input.encode(command());
        expect(closeIncomingOrderSourceContract.input.decode(encoded)).toEqual({
          kind: 'valid',
          value: command(),
        });
        const failure = {
          kind: 'conflict' as const,
          code: 'order_idempotency_conflict' as const,
          message: 'The source revision key belongs to different evidence.',
        };
        expect(
          closeIncomingOrderSourceContract.failure.decode(
            closeIncomingOrderSourceContract.failure.encode(failure),
          ),
        ).toEqual({ kind: 'valid', value: failure });
      },
    },
  ],
});

describe('close incoming Order source contract', () => {
  it('round-trips strict serialized evidence and typed dates', () => {
    const value = command();
    const encoded = closeIncomingOrderSourceContract.input.encode(value);
    expect(encoded).toMatchObject({
      revision: {
        at: '2026-08-22T16:05:00.000Z',
        observedAt: '2026-08-22T16:05:01.000Z',
      },
    });
    expect(closeIncomingOrderSourceContract.input.decode(encoded)).toEqual({
      kind: 'valid',
      value,
    });
  });

  it('rejects unknown fields, invalid principal kinds and non-JSON payloads', () => {
    const encoded = closeIncomingOrderSourceContract.input.encode(
      command(),
    ) as {
      context: Record<string, unknown>;
      revision: Record<string, unknown>;
    };
    expect(
      closeIncomingOrderSourceContract.input.decode({
        ...encoded,
        extra: true,
      }),
    ).toMatchObject({ kind: 'invalid' });
    expect(
      closeIncomingOrderSourceContract.input.decode({
        ...encoded,
        context: {
          ...encoded.context,
          principal: { kind: 'vendor', id: 'cents' },
        },
      }),
    ).toMatchObject({ kind: 'invalid' });
    expect(
      closeIncomingOrderSourceContract.input.decode({
        ...encoded,
        revision: {
          ...encoded.revision,
          normalizedPayload: { invalid: undefined },
        },
      }),
    ).toMatchObject({ kind: 'invalid' });
  });

  it('round-trips canonical fulfillment and the expected failure', () => {
    const value = {
      outcome: 'existing_order' as const,
      proposalId: '10000000-0000-4000-8000-000000000001',
      version: 2,
      canonical: {
        orderId: '20000000-0000-4000-8000-000000000001',
        fulfillmentId: '30000000-0000-4000-8000-000000000001',
        locationId: 'east',
        releaseState: 'released' as const,
      },
      replayed: true,
    };
    const encoded = closeIncomingOrderSourceContract.output.encode(value);
    expect(closeIncomingOrderSourceContract.output.decode(encoded)).toEqual({
      kind: 'valid',
      value,
    });

    const failure = {
      kind: 'validation' as const,
      code: 'incoming_order_source_close_invalid' as const,
      message: 'Invalid closure.',
    };
    expect(
      closeIncomingOrderSourceContract.failure.decode(
        closeIncomingOrderSourceContract.failure.encode(failure),
      ),
    ).toEqual({ kind: 'valid', value: failure });
  });
});
