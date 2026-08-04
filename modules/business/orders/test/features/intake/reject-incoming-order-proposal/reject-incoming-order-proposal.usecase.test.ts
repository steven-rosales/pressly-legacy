import { describe, expect, it, vi } from 'vitest';
import type {
  RejectIncomingOrderProposalOperations,
  RejectIncomingOrderProposalRepository,
} from '../../../../src/features/intake/reject-incoming-order-proposal/reject-incoming-order-proposal.port.ts';
import { makeRejectIncomingOrderProposal } from '../../../../src/features/intake/reject-incoming-order-proposal/reject-incoming-order-proposal.usecase.ts';
import {
  makeIncomingOrderProposal,
  orderProposalClock,
  orderProposalContext,
} from '../../../support/incoming-order-proposal.fixture.ts';

const rejectOperations = (
  overrides: Partial<RejectIncomingOrderProposalOperations> = {},
): RejectIncomingOrderProposalOperations => ({
  lockCommand: vi.fn(async () => undefined),
  loadResolutionByIdempotencyKey: vi.fn(async () => null),
  loadCanonicalOrderCommandReceipt: vi.fn(async () => null),
  loadProposal: vi.fn(async () => makeIncomingOrderProposal()),
  lockSource: vi.fn(async () => undefined),
  lockProposal: vi.fn(async () => undefined),
  rejectProposal: vi.fn(async () => undefined),
  ...overrides,
});

const rejectRepository = (
  operations: RejectIncomingOrderProposalOperations,
): RejectIncomingOrderProposalRepository => ({
  transaction: (work) => work(operations),
});

describe('reject incoming Order proposal', () => {
  it('rejects terminally without creating canonical work', async () => {
    const proposal = makeIncomingOrderProposal();
    const operations = rejectOperations();
    const outcome = await makeRejectIncomingOrderProposal({
      repo: rejectRepository(operations),
      clock: orderProposalClock,
    })({
      proposalId: proposal.id,
      locationId: proposal.locationId,
      expectedVersion: 1,
      idempotencyKey: 'reject-proposal-001',
      context: orderProposalContext,
      reasonCode: 'already_handled',
      reasonNote: null,
    });

    expect(outcome).toMatchObject({
      tag: 'ok',
      value: {
        state: 'rejected',
        version: 2,
        orderId: null,
        fulfillmentId: null,
      },
    });
    expect(operations.rejectProposal).toHaveBeenCalledOnce();
  });
});
