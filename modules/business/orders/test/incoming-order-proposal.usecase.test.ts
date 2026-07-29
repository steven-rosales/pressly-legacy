import { describe, expect, it, vi } from 'vitest';
import { hashOrderCommand } from '../src/order-command-idempotency.policy.ts';
import { makeCloseIncomingOrderSource } from '../src/incoming-order-proposal/close-incoming-order-source.usecase.ts';
import {
  makeAcceptIncomingOrderProposal,
  makeListIncomingOrderProposals,
  makeProposeIncomingOrder,
  makeRejectIncomingOrderProposal,
  makeRestoreIncomingOrderProposal,
} from '../src/incoming-order-proposal/incoming-order-proposal.usecase.ts';
import type {
  CloseIncomingOrderSourceOperations,
  CloseIncomingOrderSourceRepository,
  DecideIncomingOrderProposalOperations,
  DecideIncomingOrderProposalRepository,
  ListIncomingOrderProposalsRepository,
  ProposeIncomingOrderRepository,
  StoredIncomingOrderProposal,
} from '../src/incoming-order-proposal/incoming-order-proposal.port.ts';
import type {
  AcceptIncomingOrderProposalCommand,
  CloseIncomingOrderSourceCommand,
} from '../src/orders.port.ts';

const context = {
  origin: 'pressly_processor',
  principal: { kind: 'human', id: 'manager-1' },
} as const;
const adapterContext = {
  origin: 'external_orders_adapter',
  principal: { kind: 'system', id: 'external-orders' },
} as const;
const now = new Date('2026-07-28T18:00:00.000Z');
const clock = { now: () => now };

const proposal = (
  overrides: Partial<StoredIncomingOrderProposal> = {},
): StoredIncomingOrderProposal => ({
  id: '10000000-0000-4000-8000-000000000001',
  source: 'external-orders',
  externalOrderId: 'external-1',
  locationId: 'east',
  proposalKind: 'submitted_order',
  sourceRevisionAt: new Date('2026-07-28T17:59:00.000Z'),
  sourceRevisionHash: 'a'.repeat(64),
  adapterVersion: 'external-orders-v1',
  sourceNormalizedPayload: { order: { id: 'external-1' } },
  snapshot: {
    customer: null,
    displayNumber: 'P-1001',
    dueAt: new Date('2026-07-28T22:00:00.000Z'),
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
  observedAt: now,
  state: 'pending',
  version: 1,
  resolution: null,
  sourceClosure: null,
  ...overrides,
});

const proposalCommand = () => {
  const stored = proposal();
  return {
    context: adapterContext,
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

const closeCommand = (
  terminalCode: 'completed' | 'canceled' = 'completed',
): CloseIncomingOrderSourceCommand => ({
  context: adapterContext,
  source: proposal().source,
  externalOrderId: proposal().externalOrderId,
  terminalCode,
  revision: {
    at: new Date('2026-07-28T18:05:00.000Z'),
    hash: 'b'.repeat(64),
    adapterVersion: 'external-orders-v1',
    observedAt: new Date('2026-07-28T18:05:01.000Z'),
    normalizedPayload: {
      order: { id: proposal().externalOrderId, state: terminalCode },
    },
  },
});

const acceptCommand = (
  overrides: Partial<AcceptIncomingOrderProposalCommand> = {},
): AcceptIncomingOrderProposalCommand => ({
  proposalId: proposal().id,
  locationId: 'east',
  expectedVersion: 1,
  idempotencyKey: 'accept-proposal-001',
  context,
  reasonCode: 'incoming_order_accepted',
  reasonNote: null,
  ...overrides,
});

const tombstone = (
  command: CloseIncomingOrderSourceCommand = closeCommand(),
  proposalId: string | null = null,
) => ({
  source: command.source,
  externalOrderId: command.externalOrderId,
  proposalId,
  terminalCode: command.terminalCode,
  sourceRevisionAt: command.revision.at,
  sourceRevisionHash: command.revision.hash,
  observedAt: command.revision.observedAt,
});

const proposalOperations = (
  overrides: Partial<
    Parameters<ProposeIncomingOrderRepository['transaction']>[0] extends (
      operations: infer Operations,
    ) => unknown
      ? Operations
      : never
  > = {},
) => ({
  lockSource: vi.fn(async () => undefined),
  findExactOrder: vi.fn(async () => null),
  findTombstone: vi.fn(async () => null),
  findProposal: vi.fn(async () => null),
  createProposal: vi.fn(async () => ({ proposalId: proposal().id })),
  ...overrides,
});

const decisionOperations = (
  overrides: Partial<DecideIncomingOrderProposalOperations> = {},
): DecideIncomingOrderProposalOperations => ({
  lockCommand: vi.fn(async () => undefined),
  loadResolutionByIdempotencyKey: vi.fn(async () => null),
  loadCanonicalOrderCommandReceipt: vi.fn(async () => null),
  loadProposal: vi.fn(async () => proposal()),
  lockSource: vi.fn(async () => undefined),
  lockProposal: vi.fn(async () => undefined),
  findExactOrder: vi.fn(async () => null),
  loadTransitionByIdempotencyKey: vi.fn(async () => null),
  resolveOrCreateExactCustomer: vi.fn(async () => ({
    resolution: 'not_provided' as const,
    userId: null,
    externalUserId: null,
  })),
  acceptProposal: vi.fn(async () => ({
    orderId: '20000000-0000-4000-8000-000000000001',
    fulfillmentId: '30000000-0000-4000-8000-000000000001',
    version: 1,
    replayed: false,
  })),
  rejectProposal: vi.fn(async () => undefined),
  restoreProposal: vi.fn(async ({ proposal: current, transition }) => ({
    proposalId: current.id,
    state: 'restored_pending' as const,
    version: transition.version,
    replayed: false,
  })),
  ...overrides,
});

const decisionRepo = (
  operations: DecideIncomingOrderProposalOperations,
): DecideIncomingOrderProposalRepository => ({
  transaction: (work) => work(operations),
});

const closeOperations = (
  overrides: Partial<CloseIncomingOrderSourceOperations> = {},
): CloseIncomingOrderSourceOperations => ({
  lockSource: vi.fn(async () => undefined),
  findExactOrder: vi.fn(async () => null),
  findProposal: vi.fn(async () => null),
  lockProposal: vi.fn(async () => undefined),
  findTombstone: vi.fn(async () => null),
  createTombstone: vi.fn(async (command, proposalId) =>
    tombstone(command, proposalId),
  ),
  closeProposal: vi.fn(async ({ proposal: current, transition }) => ({
    outcome: 'source_closed' as const,
    proposalId: current.id,
    version: transition.version,
    canonical: null,
    replayed: false,
  })),
  ...overrides,
});

const closeRepo = (
  operations: CloseIncomingOrderSourceOperations,
): CloseIncomingOrderSourceRepository => ({
  transaction: (work) => work(operations),
});

describe('incoming Order proposal use cases', () => {
  it('stores submitted candidates and suppresses exact linked Orders', async () => {
    const operations = proposalOperations();
    const created = await makeProposeIncomingOrder({
      transaction: (work) => work(operations),
    })(proposalCommand());

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
    const suppressed = await makeProposeIncomingOrder({
      transaction: (work) => work(linked),
    })(proposalCommand());

    expect(suppressed).toMatchObject({
      tag: 'ok',
      value: { outcome: 'existing_order', replayed: true },
    });
    expect(linked.createProposal).not.toHaveBeenCalled();
  });

  it('suppresses a late submitted candidate when terminal evidence arrived first', async () => {
    const operations = proposalOperations({
      findTombstone: vi.fn(async () => tombstone()),
    });
    const outcome = await makeProposeIncomingOrder({
      transaction: (work) => work(operations),
    })(proposalCommand());

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

  it('records terminal evidence before a submitted candidate as a tombstone', async () => {
    const operations = closeOperations();
    const outcome = await makeCloseIncomingOrderSource({
      repo: closeRepo(operations),
      clock,
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
    const pending = proposal();
    const operations = closeOperations({
      findProposal: vi.fn(async () => pending),
    });
    const outcome = await makeCloseIncomingOrderSource({
      repo: closeRepo(operations),
      clock,
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
    const restored = proposal({
      state: 'restored_pending',
      version: 3,
      sourceClosure: {
        kind: 'completed',
        observedAt: new Date('2026-07-28T18:05:01.000Z'),
      },
    });
    const operations = closeOperations({
      findProposal: vi.fn(async () => restored),
      findTombstone: vi.fn(async () => tombstone(closeCommand(), restored.id)),
    });
    const outcome = await makeCloseIncomingOrderSource({
      repo: closeRepo(operations),
      clock,
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

  it('accepts once and creates an unreleased canonical Order', async () => {
    const operations = decisionOperations();
    const outcome = await makeAcceptIncomingOrderProposal({
      repo: decisionRepo(operations),
      clock,
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
    expect(operations.rejectProposal).not.toHaveBeenCalled();
  });

  it('replays a completed acceptance without creating a second canonical Order', async () => {
    const command = acceptCommand();
    const operations = decisionOperations({
      loadResolutionByIdempotencyKey: vi.fn(async () => ({
        proposalId: proposal().id,
        decision: 'accepted' as const,
        proposalVersion: 2,
        orderId: '20000000-0000-4000-8000-000000000001',
        fulfillmentId: '30000000-0000-4000-8000-000000000001',
        idempotencyKey: command.idempotencyKey,
        commandHash: hashOrderCommand(command),
      })),
    });
    const outcome = await makeAcceptIncomingOrderProposal({
      repo: decisionRepo(operations),
      clock,
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
    const closed = proposal({
      state: 'source_closed',
      version: 2,
      sourceClosure: {
        kind: 'completed',
        observedAt: new Date('2026-07-28T18:05:01.000Z'),
      },
    });
    const operations = decisionOperations({
      loadProposal: vi.fn(async () => closed),
    });
    const outcome = await makeAcceptIncomingOrderProposal({
      repo: decisionRepo(operations),
      clock,
    })(acceptCommand({ expectedVersion: 2 }));

    expect(outcome).toMatchObject({
      tag: 'err',
      error: { code: 'incoming_order_proposal_transition_invalid' },
    });
    expect(operations.acceptProposal).not.toHaveBeenCalled();
  });

  it('restores source-closed work before a manager can decide it', async () => {
    const closed = proposal({
      state: 'source_closed',
      version: 2,
      sourceClosure: {
        kind: 'completed',
        observedAt: new Date('2026-07-28T18:05:01.000Z'),
      },
    });
    const operations = decisionOperations({
      loadProposal: vi.fn(async () => closed),
    });
    const outcome = await makeRestoreIncomingOrderProposal({
      repo: decisionRepo(operations),
      clock,
    })({
      proposalId: closed.id,
      locationId: closed.locationId,
      expectedVersion: 2,
      idempotencyKey: 'restore-proposal-001',
      context,
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

  it('rejects terminally without creating canonical work', async () => {
    const operations = decisionOperations();
    const outcome = await makeRejectIncomingOrderProposal({
      repo: decisionRepo(operations),
      clock,
    })({
      proposalId: proposal().id,
      locationId: 'east',
      expectedVersion: 1,
      idempotencyKey: 'reject-proposal-001',
      context,
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
    expect(operations.acceptProposal).not.toHaveBeenCalled();
    expect(operations.resolveOrCreateExactCustomer).not.toHaveBeenCalled();
  });

  it('passes the selected lifecycle view through pagination', async () => {
    const listPending = vi.fn(async () => ({
      kind: 'invalid_cursor' as const,
    }));
    const repo: ListIncomingOrderProposalsRepository = { listPending };
    const outcome = await makeListIncomingOrderProposals(repo)({
      locationId: 'east',
      limit: 50,
      cursor: 'not-a-cursor',
      view: 'source_closed',
    });

    expect(listPending).toHaveBeenCalledWith({
      locationId: 'east',
      limit: 50,
      cursor: 'not-a-cursor',
      view: 'source_closed',
    });
    expect(outcome).toMatchObject({
      tag: 'err',
      error: {
        code: 'incoming_order_proposal_cursor_invalid',
        status: 400,
      },
    });
  });
});
