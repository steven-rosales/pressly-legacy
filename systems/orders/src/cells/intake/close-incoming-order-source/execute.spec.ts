import { canonicalSha256 } from '@pressly/codec/node';
import { describe, expect, it } from 'vitest';
import type { IncomingOrderProposal } from '../../../model/incoming-order-proposal/model.ts';
import {
  closeIncomingOrderSourceCommandHash,
  closeIncomingOrderSourceIdempotencyKey,
  makeExecuteCloseIncomingOrderSource,
} from './execute.ts';
import type {
  CloseIncomingOrderProposalInput,
  CloseIncomingOrderSourceCommand,
  CloseIncomingOrderSourceRepository,
  CloseIncomingOrderSourceTransactionRepository,
} from './types.ts';

const proposalId = '10000000-0000-4000-8000-000000000001';
const closedAt = new Date('2026-08-22T16:10:00.000Z');

const command = (
  overrides: Partial<CloseIncomingOrderSourceCommand> = {},
): CloseIncomingOrderSourceCommand => ({
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
  ...overrides,
});

const proposal = (
  state: IncomingOrderProposal['state'] = 'pending',
  version = 1,
): IncomingOrderProposal => ({
  id: proposalId,
  source: 'cents',
  externalOrderId: 'source-order-1',
  locationId: 'east',
  proposalKind: 'submitted_order',
  sourceRevisionAt: new Date('2026-08-22T15:59:00.000Z'),
  sourceRevisionHash: 'a'.repeat(64),
  adapterVersion: 'external-orders-v1',
  sourceNormalizedPayload: { order: { id: 'source-order-1' } },
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
  observedAt: new Date('2026-08-22T16:00:00.000Z'),
  state,
  version,
  resolution: null,
  sourceClosure:
    state === 'source_closed'
      ? { kind: 'completed', observedAt: new Date('2026-08-22T16:05:01.000Z') }
      : null,
});

type OperationsInput = Readonly<{
  calls: string[];
  proposal?: IncomingOrderProposal | null;
  existingTombstone?: boolean;
  canonical?: boolean;
  fail?: boolean;
  closed?: CloseIncomingOrderProposalInput[];
}>;

const operations = (
  input: OperationsInput,
): CloseIncomingOrderSourceTransactionRepository => ({
  lockSource: async () => {
    input.calls.push('lock-source');
    if (input.fail) throw { fault: 'database unavailable' };
  },
  findProposal: async () => {
    input.calls.push('find-proposal');
    return input.proposal === undefined ? proposal() : input.proposal;
  },
  lockProposal: async () => {
    input.calls.push('lock-proposal');
  },
  findTombstone: async () => {
    input.calls.push('find-tombstone');
    return input.existingTombstone
      ? {
          source: 'cents',
          externalOrderId: 'source-order-1',
          proposalId: input.proposal?.id ?? null,
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
  createTombstone: async (_command, storedProposalId) => {
    input.calls.push('create-tombstone');
    return {
      source: 'cents',
      externalOrderId: 'source-order-1',
      proposalId: storedProposalId,
      terminalCode: 'completed',
      sourceRevisionAt: new Date('2026-08-22T16:05:00.000Z'),
      sourceRevisionHash: 'b'.repeat(64),
      adapterVersion: 'external-orders-v1',
      normalizedPayload: {
        order: { id: 'source-order-1', state: 'completed' },
      },
      observedAt: new Date('2026-08-22T16:05:01.000Z'),
    };
  },
  findExactOrder: async () => {
    input.calls.push('find-canonical');
    return input.canonical
      ? {
          orderId: '20000000-0000-4000-8000-000000000001',
          fulfillment: {
            fulfillmentId: '30000000-0000-4000-8000-000000000001',
            locationId: 'east',
            releaseState: 'released',
          },
        }
      : null;
  },
  closeProposal: async (closeInput) => {
    input.calls.push('close-proposal');
    input.closed?.push(closeInput);
    return {
      outcome: 'source_closed',
      proposalId: closeInput.proposal.id,
      version: closeInput.transition.version,
      canonical: null,
      replayed: false,
    };
  },
});

const repository = (
  repositoryOperations: CloseIncomingOrderSourceTransactionRepository,
  calls: string[],
): CloseIncomingOrderSourceRepository => ({
  transaction: (work) => {
    calls.push('transaction');
    return work(repositoryOperations);
  },
});

describe('execute close incoming Order source', () => {
  it('rejects invalid evidence before reading the clock or opening a transaction', async () => {
    let clockReads = 0;
    let transactions = 0;
    const execute = makeExecuteCloseIncomingOrderSource({
      clock: {
        now: () => {
          clockReads += 1;
          return closedAt;
        },
      },
      repo: {
        transaction: async () => {
          transactions += 1;
          return undefined as never;
        },
      },
    });

    await expect(
      execute(command({ externalOrderId: ' ' })),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'incoming_order_source_close_invalid' },
    });
    expect(clockReads).toBe(0);
    expect(transactions).toBe(0);
  });

  it('preserves clock then transaction and exact lock/read/write order', async () => {
    const calls: string[] = [];
    const closed: CloseIncomingOrderProposalInput[] = [];
    const repositoryOperations = operations({ calls, closed });
    const execute = makeExecuteCloseIncomingOrderSource({
      clock: {
        now: () => {
          calls.push('clock');
          return closedAt;
        },
      },
      repo: repository(repositoryOperations, calls),
    });

    await expect(execute(command())).resolves.toMatchObject({
      kind: 'success',
      value: {
        outcome: 'source_closed',
        proposalId,
        version: 2,
        replayed: false,
      },
    });
    expect(calls).toEqual([
      'clock',
      'transaction',
      'lock-source',
      'find-proposal',
      'lock-proposal',
      'find-proposal',
      'find-tombstone',
      'create-tombstone',
      'find-canonical',
      'close-proposal',
    ]);
    expect(closed).toEqual([
      expect.objectContaining({
        idempotencyKey: `incoming-order-source-close:cents:source-order-1:${'b'.repeat(64)}`,
        commandHash: closeIncomingOrderSourceCommandHash(command()),
        closedAt,
        transition: {
          from: 'pending',
          to: 'source_closed',
          event: 'source_close',
          version: 2,
        },
      }),
    ]);
  });

  it.each([
    {
      name: 'terminal evidence without a proposal',
      fixture: { proposal: null },
      value: { outcome: 'tombstoned', replayed: false },
    },
    {
      name: 'replayed terminal evidence without a proposal',
      fixture: { proposal: null, existingTombstone: true },
      value: { outcome: 'tombstoned', replayed: true },
    },
    {
      name: 'a source-closed proposal',
      fixture: {
        proposal: proposal('source_closed', 2),
        existingTombstone: true,
      },
      value: { outcome: 'already_source_closed', replayed: true, version: 2 },
    },
    {
      name: 'a restored proposal',
      fixture: {
        proposal: proposal('restored_pending', 3),
        existingTombstone: true,
      },
      value: { outcome: 'already_decided', replayed: true, version: 3 },
    },
    {
      name: 'an exact canonical fulfillment',
      fixture: { canonical: true },
      value: {
        outcome: 'existing_order',
        replayed: false,
        canonical: {
          orderId: '20000000-0000-4000-8000-000000000001',
          fulfillmentId: '30000000-0000-4000-8000-000000000001',
          locationId: 'east',
          releaseState: 'released',
        },
      },
    },
  ])('preserves $name outcome', async (scenario) => {
    const calls: string[] = [];
    const execute = makeExecuteCloseIncomingOrderSource({
      clock: { now: () => closedAt },
      repo: repository(operations({ calls, ...scenario.fixture }), calls),
    });
    await expect(execute(command())).resolves.toMatchObject({
      kind: 'success',
      value: scenario.value,
    });
  });

  it('maps repository faults to the exact public database error', async () => {
    const calls: string[] = [];
    const execute = makeExecuteCloseIncomingOrderSource({
      clock: { now: () => closedAt },
      repo: repository(operations({ calls, fail: true }), calls),
    });
    await expect(execute(command())).rejects.toMatchObject({
      kind: 'DatabaseError',
      code: 'incoming_order_source_close_failed',
      safeMessage: 'The source-terminal observation could not be recorded.',
      status: 503,
    });
  });

  it('retains the exact deployed command identity bytes', () => {
    const value = command();
    expect(closeIncomingOrderSourceIdempotencyKey(value)).toBe(
      `incoming-order-source-close:cents:source-order-1:${'b'.repeat(64)}`,
    );
    expect(closeIncomingOrderSourceCommandHash(value)).toBe(
      canonicalSha256({
        source: value.source,
        externalOrderId: value.externalOrderId,
        terminalCode: value.terminalCode,
        revision: value.revision,
      }),
    );
  });
});
