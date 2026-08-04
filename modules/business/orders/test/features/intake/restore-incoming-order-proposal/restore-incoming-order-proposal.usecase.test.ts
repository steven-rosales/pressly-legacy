import { describe, expect, it, vi } from 'vitest';
import type {
  RestoreIncomingOrderProposalOperations,
  RestoreIncomingOrderProposalRepository,
} from '../../../../src/features/intake/restore-incoming-order-proposal/restore-incoming-order-proposal.port.ts';
import { makeRestoreIncomingOrderProposal } from '../../../../src/features/intake/restore-incoming-order-proposal/restore-incoming-order-proposal.usecase.ts';
import {
  makeIncomingOrderProposal,
  orderProposalClock,
  orderProposalContext,
} from '../../../support/incoming-order-proposal.fixture.ts';

const restoreOperations = (
  overrides: Partial<RestoreIncomingOrderProposalOperations> = {},
): RestoreIncomingOrderProposalOperations => ({
  lockCommand: vi.fn(async () => undefined),
  loadTransitionByIdempotencyKey: vi.fn(async () => null),
  loadProposal: vi.fn(async () => makeIncomingOrderProposal()),
  lockSource: vi.fn(async () => undefined),
  lockProposal: vi.fn(async () => undefined),
  restoreProposal: vi.fn(async ({ proposal, transition }) => ({
    proposalId: proposal.id,
    state: 'restored_pending' as const,
    version: transition.version,
    replayed: false,
  })),
  ...overrides,
});

const restoreRepository = (
  operations: RestoreIncomingOrderProposalOperations,
): RestoreIncomingOrderProposalRepository => ({
  transaction: (work) => work(operations),
});

describe('restore incoming Order proposal', () => {
  it('restores source-closed work before a manager can decide it', async () => {
    const closed = makeIncomingOrderProposal({
      state: 'source_closed',
      version: 2,
      sourceClosure: {
        kind: 'completed',
        observedAt: new Date('2026-07-28T18:05:01.000Z'),
      },
    });
    const operations = restoreOperations({
      loadProposal: vi.fn(async () => closed),
    });
    const outcome = await makeRestoreIncomingOrderProposal({
      repo: restoreRepository(operations),
      clock: orderProposalClock,
    })({
      proposalId: closed.id,
      locationId: closed.locationId,
      expectedVersion: 2,
      idempotencyKey: 'restore-proposal-001',
      context: orderProposalContext,
      reasonCode: 'source_closure_overridden',
      reasonNote: 'Manager verified that the physical work is still active.',
    });

    expect(outcome).toMatchObject({
      tag: 'ok',
      value: {
        proposalId: closed.id,
        state: 'restored_pending',
        version: 3,
        replayed: false,
      },
    });
    expect(operations.restoreProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        transition: {
          from: 'source_closed',
          to: 'restored_pending',
          event: 'restore',
          version: 3,
        },
      }),
    );
  });
});
