import { describe, expect, it, vi } from 'vitest';
import type {
  ProposeIncomingOrderOperations,
  ProposeIncomingOrderRepository,
} from '../../../../src/features/intake/propose-incoming-order/propose-incoming-order.port.ts';
import { makeProposeIncomingOrder } from '../../../../src/features/intake/propose-incoming-order/propose-incoming-order.usecase.ts';
import {
  externalOrdersAdapterContext,
  makeIncomingOrderProposal,
  makeIncomingOrderSourceTombstone,
} from '../../../support/incoming-order-proposal.fixture.ts';

const proposalCommand = () => {
  const stored = makeIncomingOrderProposal();
  return {
    context: externalOrdersAdapterContext,
    source: stored.source,
    externalOrderId: stored.externalOrderId,
    proposalKind: 'submitted_order',
    snapshot: stored.snapshot,
    revision: {
      at: stored.sourceRevisionAt,
      hash: stored.sourceRevisionHash,
      adapterVersion: stored.adapterVersion,
      observedAt: stored.observedAt,
      normalizedPayload: stored.sourceNormalizedPayload,
    },
  } as const;
};

const proposalOperations = (
  overrides: Partial<ProposeIncomingOrderOperations> = {},
): ProposeIncomingOrderOperations => ({
  lockSource: vi.fn(async () => undefined),
  findExactOrder: vi.fn(async () => null),
  findTombstone: vi.fn(async () => null),
  findProposal: vi.fn(async () => null),
  createProposal: vi.fn(async () => ({
    proposalId: makeIncomingOrderProposal().id,
  })),
  ...overrides,
});

const proposalRepository = (
  operations: ProposeIncomingOrderOperations,
): ProposeIncomingOrderRepository => ({
  transaction: (work) => work(operations),
});

describe('propose incoming Order', () => {
  it('stores submitted candidates and suppresses exact linked Orders', async () => {
    const operations = proposalOperations();
    const created = await makeProposeIncomingOrder(
      proposalRepository(operations),
    )(proposalCommand());

    expect(created).toMatchObject({
      tag: 'ok',
      value: { outcome: 'proposed', version: 1, replayed: false },
    });
    expect(operations.createProposal).toHaveBeenCalledWith(
      expect.objectContaining({ proposalKind: 'submitted_order' }),
    );

    const linked = proposalOperations({
      findExactOrder: vi.fn(async () => ({
        orderId: '20000000-0000-4000-8000-000000000001',
        fulfillment: {
          fulfillmentId: '30000000-0000-4000-8000-000000000001',
          locationId: 'east',
          releaseState: 'unreleased' as const,
        },
      })),
    });
    const suppressed = await makeProposeIncomingOrder(
      proposalRepository(linked),
    )(proposalCommand());

    expect(suppressed).toMatchObject({
      tag: 'ok',
      value: { outcome: 'existing_order', replayed: true },
    });
    expect(linked.createProposal).not.toHaveBeenCalled();
  });

  it('suppresses a late submitted candidate when terminal evidence arrived first', async () => {
    const operations = proposalOperations({
      findTombstone: vi.fn(async () => makeIncomingOrderSourceTombstone()),
    });
    const outcome = await makeProposeIncomingOrder(
      proposalRepository(operations),
    )(proposalCommand());

    expect(outcome).toMatchObject({
      tag: 'ok',
      value: {
        outcome: 'source_closed',
        proposalId: null,
        version: null,
        replayed: true,
      },
    });
    expect(operations.findProposal).not.toHaveBeenCalled();
    expect(operations.createProposal).not.toHaveBeenCalled();
  });
});
