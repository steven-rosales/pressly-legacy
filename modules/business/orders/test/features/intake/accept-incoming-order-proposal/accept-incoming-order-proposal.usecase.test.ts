import { result } from '@pressly/kernel';
import { describe, expect, it, vi } from 'vitest';
import type { AcceptIncomingOrderProposalCommand } from '../../../../src/features/intake/accept-incoming-order-proposal/accept-incoming-order-proposal.model.ts';
import type {
  AcceptIncomingOrderProposalOperations,
  AcceptIncomingOrderProposalRepository,
} from '../../../../src/features/intake/accept-incoming-order-proposal/accept-incoming-order-proposal.port.ts';
import { makeAcceptIncomingOrderProposal } from '../../../../src/features/intake/accept-incoming-order-proposal/accept-incoming-order-proposal.usecase.ts';
import { hashOrderCommand } from '../../../../src/foundations/language/command-execution/order-command-idempotency.policy.ts';
import {
  makeIncomingOrderProposal,
  orderProposalClock,
  orderProposalContext,
} from '../../../support/incoming-order-proposal.fixture.ts';

const acceptCommand = (
  overrides: Partial<AcceptIncomingOrderProposalCommand> = {},
): AcceptIncomingOrderProposalCommand => ({
  proposalId: makeIncomingOrderProposal().id,
  locationId: 'east',
  expectedVersion: 1,
  idempotencyKey: 'accept-proposal-001',
  context: orderProposalContext,
  reasonCode: 'incoming_order_accepted',
  reasonNote: null,
  ...overrides,
});

const acceptOperations = (
  overrides: Partial<AcceptIncomingOrderProposalOperations> = {},
): AcceptIncomingOrderProposalOperations => ({
  lockCommand: vi.fn(async () => undefined),
  loadResolutionByIdempotencyKey: vi.fn(async () => null),
  loadCanonicalOrderCommandReceipt: vi.fn(async () => null),
  loadProposal: vi.fn(async () => makeIncomingOrderProposal()),
  lockSource: vi.fn(async () => undefined),
  lockProposal: vi.fn(async () => undefined),
  findExactOrder: vi.fn(async () => null),
  resolveOrCreateExactCustomer: vi.fn(async () =>
    result.ok({
      resolution: 'not_provided' as const,
      userId: null,
      externalUserId: null,
    }),
  ),
  acceptProposal: vi.fn(async () => ({
    orderId: '20000000-0000-4000-8000-000000000001',
    fulfillmentId: '30000000-0000-4000-8000-000000000001',
    version: 1,
    replayed: false,
  })),
  ...overrides,
});

const acceptRepository = (
  operations: AcceptIncomingOrderProposalOperations,
): AcceptIncomingOrderProposalRepository => ({
  transaction: (work) => work(operations),
});

describe('accept incoming Order proposal', () => {
  it('accepts once and creates an unreleased canonical Order', async () => {
    const operations = acceptOperations();
    const outcome = await makeAcceptIncomingOrderProposal({
      repo: acceptRepository(operations),
      clock: orderProposalClock,
    })(acceptCommand());

    expect(outcome).toMatchObject({
      tag: 'ok',
      value: {
        state: 'accepted',
        version: 2,
        orderId: '20000000-0000-4000-8000-000000000001',
      },
    });
    expect(operations.acceptProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        canonical: { state: 'open', releaseState: 'unreleased' },
        transition: {
          from: 'pending',
          to: 'accepted',
          event: 'accept',
          version: 2,
        },
      }),
    );
  });

  it('replays a completed acceptance without creating a second canonical Order', async () => {
    const command = acceptCommand();
    const operations = acceptOperations({
      loadResolutionByIdempotencyKey: vi.fn(async () => ({
        proposalId: makeIncomingOrderProposal().id,
        decision: 'accepted' as const,
        proposalVersion: 2,
        orderId: '20000000-0000-4000-8000-000000000001',
        fulfillmentId: '30000000-0000-4000-8000-000000000001',
        idempotencyKey: command.idempotencyKey,
        commandHash: hashOrderCommand(command),
      })),
    });
    const outcome = await makeAcceptIncomingOrderProposal({
      repo: acceptRepository(operations),
      clock: orderProposalClock,
    })(command);

    expect(outcome).toMatchObject({
      tag: 'ok',
      value: {
        state: 'accepted',
        version: 2,
        replayed: true,
      },
    });
    expect(operations.loadProposal).not.toHaveBeenCalled();
    expect(operations.acceptProposal).not.toHaveBeenCalled();
  });

  it('cannot accept a candidate while its source closure is in force', async () => {
    const closed = makeIncomingOrderProposal({
      state: 'source_closed',
      version: 2,
      sourceClosure: {
        kind: 'completed',
        observedAt: new Date('2026-07-28T18:05:01.000Z'),
      },
    });
    const operations = acceptOperations({
      loadProposal: vi.fn(async () => closed),
    });
    const outcome = await makeAcceptIncomingOrderProposal({
      repo: acceptRepository(operations),
      clock: orderProposalClock,
    })(acceptCommand({ expectedVersion: 2 }));

    expect(outcome).toMatchObject({
      tag: 'err',
      error: { code: 'incoming_order_proposal_transition_invalid' },
    });
    expect(operations.acceptProposal).not.toHaveBeenCalled();
  });

  it('returns canonical customer conflicts as expected feature failures', async () => {
    const operations = acceptOperations({
      resolveOrCreateExactCustomer: vi.fn(async () =>
        result.err({
          kind: 'conflict' as const,
          code: 'canonical_source_user_business_conflict' as const,
        }),
      ),
    });

    const outcome = await makeAcceptIncomingOrderProposal({
      repo: acceptRepository(operations),
      clock: orderProposalClock,
    })(acceptCommand());

    expect(outcome).toEqual({
      tag: 'err',
      error: {
        kind: 'conflict',
        code: 'canonical_source_user_business_conflict',
        message:
          'The source customer is already associated with another business.',
      },
    });
    expect(operations.acceptProposal).not.toHaveBeenCalled();
  });
});
