import { describe, expect, it, vi } from 'vitest';
import type { CloseIncomingOrderSourceCommand } from '../../../../src/features/intake/close-incoming-order-source/close-incoming-order-source.model.ts';
import type {
  CloseIncomingOrderSourceOperations,
  CloseIncomingOrderSourceRepository,
} from '../../../../src/features/intake/close-incoming-order-source/close-incoming-order-source.port.ts';
import { makeCloseIncomingOrderSource } from '../../../../src/features/intake/close-incoming-order-source/close-incoming-order-source.usecase.ts';
import {
  externalOrdersAdapterContext,
  makeIncomingOrderProposal,
  makeIncomingOrderSourceTombstone,
  orderProposalClock,
} from '../../../support/incoming-order-proposal.fixture.ts';

const closeCommand = (
  terminalCode: 'completed' | 'canceled' = 'completed',
): CloseIncomingOrderSourceCommand => {
  const proposal = makeIncomingOrderProposal();
  return {
    context: externalOrdersAdapterContext,
    source: proposal.source,
    externalOrderId: proposal.externalOrderId,
    terminalCode,
    revision: {
      at: new Date('2026-07-28T18:05:00.000Z'),
      hash: 'b'.repeat(64),
      adapterVersion: 'external-orders-v1',
      observedAt: new Date('2026-07-28T18:05:01.000Z'),
      normalizedPayload: {
        order: { id: proposal.externalOrderId, state: terminalCode },
      },
    },
  };
};

const closeOperations = (
  overrides: Partial<CloseIncomingOrderSourceOperations> = {},
): CloseIncomingOrderSourceOperations => ({
  lockSource: vi.fn(async () => undefined),
  findExactOrder: vi.fn(async () => null),
  findProposal: vi.fn(async () => null),
  lockProposal: vi.fn(async () => undefined),
  findTombstone: vi.fn(async () => null),
  createTombstone: vi.fn(async (command, proposalId) =>
    makeIncomingOrderSourceTombstone({
      source: command.source,
      externalOrderId: command.externalOrderId,
      proposalId,
      terminalCode: command.terminalCode,
      sourceRevisionAt: command.revision.at,
      sourceRevisionHash: command.revision.hash,
      observedAt: command.revision.observedAt,
    }),
  ),
  closeProposal: vi.fn(async ({ proposal, transition }) => ({
    outcome: 'source_closed' as const,
    proposalId: proposal.id,
    version: transition.version,
    canonical: null,
    replayed: false,
  })),
  ...overrides,
});

const closeRepository = (
  operations: CloseIncomingOrderSourceOperations,
): CloseIncomingOrderSourceRepository => ({
  transaction: (work) => work(operations),
});

describe('close incoming Order source', () => {
  it('records terminal evidence before a submitted candidate as a tombstone', async () => {
    const operations = closeOperations();
    const outcome = await makeCloseIncomingOrderSource({
      repo: closeRepository(operations),
      clock: orderProposalClock,
    })(closeCommand('canceled'));

    expect(outcome).toMatchObject({
      tag: 'ok',
      value: {
        outcome: 'tombstoned',
        proposalId: null,
        version: null,
        replayed: false,
      },
    });
    expect(operations.createTombstone).toHaveBeenCalledWith(
      expect.objectContaining({ terminalCode: 'canceled' }),
      null,
    );
    expect(operations.closeProposal).not.toHaveBeenCalled();
  });

  it('closes a pending candidate through the source-close graph edge', async () => {
    const pending = makeIncomingOrderProposal();
    const operations = closeOperations({
      findProposal: vi.fn(async () => pending),
    });
    const outcome = await makeCloseIncomingOrderSource({
      repo: closeRepository(operations),
      clock: orderProposalClock,
    })(closeCommand());

    expect(outcome).toMatchObject({
      tag: 'ok',
      value: {
        outcome: 'source_closed',
        proposalId: pending.id,
        version: 2,
      },
    });
    expect(operations.createTombstone).toHaveBeenCalledWith(
      expect.anything(),
      pending.id,
    );
    expect(operations.closeProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        proposal: pending,
        transition: {
          from: 'pending',
          to: 'source_closed',
          event: 'source_close',
          version: 2,
        },
      }),
    );
  });

  it('does not let later source closure override a restored candidate', async () => {
    const restored = makeIncomingOrderProposal({
      state: 'restored_pending',
      version: 3,
      sourceClosure: {
        kind: 'completed',
        observedAt: new Date('2026-07-28T18:05:01.000Z'),
      },
    });
    const operations = closeOperations({
      findProposal: vi.fn(async () => restored),
      findTombstone: vi.fn(async () =>
        makeIncomingOrderSourceTombstone({ proposalId: restored.id }),
      ),
    });
    const outcome = await makeCloseIncomingOrderSource({
      repo: closeRepository(operations),
      clock: orderProposalClock,
    })(closeCommand());

    expect(outcome).toMatchObject({
      tag: 'ok',
      value: {
        outcome: 'already_decided',
        proposalId: restored.id,
        version: 3,
        replayed: true,
      },
    });
    expect(operations.closeProposal).not.toHaveBeenCalled();
  });
});
