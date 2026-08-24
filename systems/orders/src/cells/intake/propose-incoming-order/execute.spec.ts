import { describe, expect, it } from 'vitest';
import type { IncomingOrderProposal } from '../../../model/incoming-order-proposal/model.ts';
import { makeExecuteProposeIncomingOrder } from './execute.ts';
import type {
  ProposeIncomingOrderCommand,
  ProposeIncomingOrderRepository,
  ProposeIncomingOrderTransactionRepository,
} from './types.ts';

const proposalId = '10000000-0000-4000-8000-000000000001';

const command = (
  overrides: Partial<ProposeIncomingOrderCommand> = {},
): ProposeIncomingOrderCommand => ({
  context: {
    origin: 'external_orders_adapter',
    principal: { kind: 'system', id: 'external-orders' },
  },
  source: 'cents',
  externalOrderId: 'source-order-1',
  proposalKind: 'submitted_order',
  snapshot: {
    customer: null,
    displayNumber: 'P-1001',
    dueAt: new Date('2026-08-23T20:00:00.000Z'),
    currency: 'USD',
    totalAmountCents: 3_000,
    balanceDueCents: 3_000,
    items: [],
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
  ...overrides,
});

const proposal = (): IncomingOrderProposal => ({
  id: proposalId,
  source: 'cents',
  externalOrderId: 'source-order-1',
  locationId: 'east',
  proposalKind: 'submitted_order',
  sourceRevisionAt: new Date('2026-08-22T15:59:00.000Z'),
  sourceRevisionHash: 'a'.repeat(64),
  adapterVersion: 'external-orders-v1',
  sourceNormalizedPayload: { order: { id: 'source-order-1' } },
  snapshot: command().snapshot,
  observedAt: new Date('2026-08-22T16:00:00.000Z'),
  state: 'pending',
  version: 1,
  resolution: null,
  sourceClosure: null,
});

const repository = (
  operations: ProposeIncomingOrderTransactionRepository,
): ProposeIncomingOrderRepository => ({
  transaction: (work) => work(operations),
});

const operations = (input: {
  calls: string[];
  canonical?: boolean;
  tombstone?: boolean;
  existing?: boolean;
  fail?: boolean;
}): ProposeIncomingOrderTransactionRepository => ({
  lockSource: async () => {
    input.calls.push('lock-source');
    if (input.fail) throw { fault: 'database unavailable' };
  },
  findExactOrder: async () => {
    input.calls.push('find-canonical');
    return input.canonical
      ? {
          orderId: '20000000-0000-4000-8000-000000000001',
          fulfillment: null,
        }
      : null;
  },
  findTombstone: async () => {
    input.calls.push('find-tombstone');
    return input.tombstone
      ? {
          source: 'cents',
          externalOrderId: 'source-order-1',
          proposalId,
          terminalCode: 'completed',
          sourceRevisionAt: new Date('2026-08-22T16:05:00.000Z'),
          sourceRevisionHash: 'b'.repeat(64),
          adapterVersion: 'external-orders-v1',
          normalizedPayload: {
            order: { id: 'source-order-1', state: 'completed' },
          },
          observedAt: new Date('2026-08-22T16:05:01.000Z'),
        }
      : null;
  },
  findProposal: async () => {
    input.calls.push('find-proposal');
    return input.existing ? proposal() : null;
  },
  createProposal: async () => {
    input.calls.push('create-proposal');
    return { proposalId };
  },
});

describe('execute propose incoming Order', () => {
  it('rejects invalid input before opening a transaction', async () => {
    let transactions = 0;
    const execute = makeExecuteProposeIncomingOrder({
      repo: {
        transaction: async () => {
          transactions += 1;
          return undefined as never;
        },
      },
    });
    await expect(execute(command({ source: ' ' }))).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'incoming_order_proposal_invalid' },
    });
    expect(transactions).toBe(0);
  });

  it.each([
    {
      name: 'canonical link',
      fixture: { canonical: true },
      outcome: 'existing_order',
      calls: ['lock-source', 'find-canonical'],
    },
    {
      name: 'tombstone',
      fixture: { tombstone: true },
      outcome: 'source_closed',
      calls: ['lock-source', 'find-canonical', 'find-tombstone'],
    },
    {
      name: 'existing proposal',
      fixture: { existing: true },
      outcome: 'existing_proposal',
      calls: [
        'lock-source',
        'find-canonical',
        'find-tombstone',
        'find-proposal',
      ],
    },
    {
      name: 'new proposal',
      fixture: {},
      outcome: 'proposed',
      calls: [
        'lock-source',
        'find-canonical',
        'find-tombstone',
        'find-proposal',
        'create-proposal',
      ],
    },
  ])('preserves $name precedence and exact effect order', async (scenario) => {
    const calls: string[] = [];
    const execute = makeExecuteProposeIncomingOrder({
      repo: repository(operations({ calls, ...scenario.fixture })),
    });
    await expect(execute(command())).resolves.toMatchObject({
      kind: 'success',
      value: { outcome: scenario.outcome },
    });
    expect(calls).toEqual(scenario.calls);
  });

  it('maps an unexpected repository fault to the exact public database error', async () => {
    const execute = makeExecuteProposeIncomingOrder({
      repo: repository(operations({ calls: [], fail: true })),
    });
    await expect(execute(command())).rejects.toMatchObject({
      kind: 'DatabaseError',
      code: 'incoming_order_proposal_failed',
      safeMessage: 'The incoming Order proposal could not be stored.',
      status: 503,
    });
  });
});
