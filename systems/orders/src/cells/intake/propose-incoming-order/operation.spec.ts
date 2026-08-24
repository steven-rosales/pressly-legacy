import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import { proposeIncomingOrderCellDeclaration } from './cell.ts';
import { validateProposeIncomingOrder } from './decide.ts';
import { makeExecuteProposeIncomingOrder } from './execute.ts';
import type { ProposeIncomingOrderCommand } from './types.ts';

const command: ProposeIncomingOrderCommand = {
  context: {
    origin: 'external_orders_adapter',
    principal: { kind: 'system', id: 'external-orders' },
  },
  source: 'cents',
  externalOrderId: 'source-order-1',
  proposalKind: 'submitted_order',
  snapshot: {
    customer: null,
    displayNumber: 'P-790',
    dueAt: new Date('2026-08-25T20:00:00.000Z'),
    currency: 'USD',
    totalAmountCents: 3_600,
    balanceDueCents: 3_600,
    items: [],
    fulfillment: {
      typeCode: 'wash_fold',
      locationId: 'east',
      estimatedWeightLbs: 18,
      estimatedWeightSource: 'source_estimate',
    },
  },
  revision: {
    at: new Date('2026-08-23T15:59:00.000Z'),
    hash: 'a'.repeat(64),
    adapterVersion: 'external-orders-v1',
    observedAt: new Date('2026-08-23T16:00:00.000Z'),
    normalizedPayload: { order: { id: 'source-order-1' } },
  },
};

proveOperation({
  operationId: 'orders.propose-incoming-order.v1',
  declaration: proposeIncomingOrderCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'accepts a complete submitted snapshot and rejects an empty source purely',
      proves: ['decision'],
      run: () => {
        expect(validateProposeIncomingOrder(command)).toBeNull();
        expect(
          validateProposeIncomingOrder({ ...command, source: ' ' }),
        ).toMatchObject({ code: 'incoming_order_proposal_invalid' });
      },
    },
    {
      name: 'locks source identity and creates exactly one proposal when no prior authority exists',
      proves: ['executor-success'],
      run: async () => {
        const calls: string[] = [];
        const createProposal = vi.fn(async () => ({
          proposalId: '79000000-0000-4000-8000-000000000003',
        }));
        const execute = makeExecuteProposeIncomingOrder({
          repo: {
            transaction: (work) =>
              work({
                lockSource: async () => {
                  calls.push('lock-source');
                },
                findExactOrder: async () => null,
                findTombstone: async () => null,
                findProposal: async () => null,
                createProposal,
              }),
          },
        });
        await expect(execute(command)).resolves.toMatchObject({
          kind: 'success',
          value: { outcome: 'proposed', version: 1, replayed: false },
        });
        expect(calls).toEqual(['lock-source']);
        expect(createProposal).toHaveBeenCalledWith(command);
      },
    },
  ],
});
