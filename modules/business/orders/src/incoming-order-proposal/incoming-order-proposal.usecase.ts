import { isCommandContextValid, result } from '@pressly/kernel';
import { hashOrderCommand } from '../command-execution/order-command-idempotency.policy.ts';
import type { OrderClockPort } from '../command-execution/order-command.port.ts';
import { orderError } from '../failure-mapping/order.error.ts';
import { isOrderInputValid } from '../order-model/order-input.policy.ts';
import {
  allowedIncomingOrderProposalEvents,
  decideIncomingOrderProposal,
} from './incoming-order-proposal.policy.ts';
import type {
  AcceptIncomingOrderProposal,
  IncomingOrderProposalDecisionResult,
  ListIncomingOrderProposals,
  ProposeIncomingOrder,
  RejectIncomingOrderProposal,
  RestoreIncomingOrderProposal,
} from './incoming-order-proposal.port.ts';
import {
  decisionResultFromResolution,
  type DecideIncomingOrderProposalRepository,
  type DecideIncomingOrderProposalOperations,
  type ListIncomingOrderProposalsRepository,
  type ProposeIncomingOrderRepository,
  type StoredIncomingOrderProposal,
} from './incoming-order-proposal.port.ts';

const proposalInputValid = (
  command: Parameters<ProposeIncomingOrder>[0],
): boolean => {
  const customer = command.snapshot.customer;
  return (
    command.source.trim() !== '' &&
    command.externalOrderId.trim() !== '' &&
    isCommandContextValid(command.context) &&
    command.proposalKind === 'submitted_order' &&
    command.revision.adapterVersion.trim() !== '' &&
    /^[a-f0-9]{64}$/.test(command.revision.hash) &&
    Number.isFinite(command.revision.at.getTime()) &&
    Number.isFinite(command.revision.observedAt.getTime()) &&
    (customer === null || customer.externalUserId.trim() !== '') &&
    isOrderInputValid({
      customer: {
        resolution: 'not_provided',
        userId: null,
        externalUserId: null,
      },
      displayNumber: command.snapshot.displayNumber,
      state: 'open',
      dueAt: command.snapshot.dueAt,
      currency: command.snapshot.currency,
      totalAmountCents: command.snapshot.totalAmountCents,
      balanceDueCents: command.snapshot.balanceDueCents,
      items: command.snapshot.items,
      fulfillment: {
        ...command.snapshot.fulfillment,
        releaseState: 'unreleased',
        bagCount: null,
      },
    })
  );
};

export const makeProposeIncomingOrder =
  (repo: ProposeIncomingOrderRepository): ProposeIncomingOrder =>
  async (command) => {
    if (!proposalInputValid(command))
      return result.err(
        orderError(
          'INCOMING_ORDER_PROPOSAL_INVALID',
          'The incoming Order candidate is incomplete or is not an exact submitted Order.',
          400,
        ),
      );
    try {
      const outcome = await repo.transaction(async (operations) => {
        await operations.lockSource(command.source, command.externalOrderId);
        const linked = await operations.findExactOrder(
          command.source,
          command.externalOrderId,
        );
        if (linked !== null)
          return {
            proposalId: null,
            version: null,
            replayed: true,
            outcome: 'existing_order' as const,
          };
        const tombstone = await operations.findTombstone(
          command.source,
          command.externalOrderId,
        );
        if (tombstone !== null)
          return {
            proposalId: tombstone.proposalId,
            version: null,
            replayed: true,
            outcome: 'source_closed' as const,
          };
        const existing = await operations.findProposal(
          command.source,
          command.externalOrderId,
        );
        if (existing !== null)
          return {
            proposalId: existing.id,
            version: existing.version,
            replayed: true,
            outcome: 'existing_proposal' as const,
          };
        const created = await operations.createProposal(command);
        return {
          proposalId: created.proposalId,
          version: 1,
          replayed: false,
          outcome: 'proposed' as const,
        };
      });
      return result.ok(outcome);
    } catch (error) {
      return result.err(
        orderError(
          'INCOMING_ORDER_PROPOSAL_FAILED',
          'The incoming Order proposal could not be stored.',
          503,
          error,
        ),
      );
    }
  };

export const makeListIncomingOrderProposals =
  (repo: ListIncomingOrderProposalsRepository): ListIncomingOrderProposals =>
  async (query) => {
    if (
      query.locationId.trim() === '' ||
      !Number.isInteger(query.limit) ||
      query.limit < 1 ||
      query.limit > 100 ||
      (query.view !== 'needs_review' && query.view !== 'source_closed') ||
      (query.cursor !== null && query.cursor.trim() === '')
    )
      return result.err(
        orderError(
          'INCOMING_ORDER_PROPOSAL_QUERY_INVALID',
          'The incoming Order proposal query is invalid.',
          400,
        ),
      );
    try {
      const loaded = await repo.listPending(query);
      if (loaded.kind === 'invalid_cursor')
        return result.err(
          orderError(
            'INCOMING_ORDER_PROPOSAL_CURSOR_INVALID',
            'The incoming Order proposal cursor is invalid.',
            400,
          ),
        );
      return result.ok(loaded.value);
    } catch (error) {
      return result.err(
        orderError(
          'INCOMING_ORDER_PROPOSAL_QUERY_FAILED',
          'Incoming Order proposals could not be loaded.',
          503,
          error,
        ),
      );
    }
  };

const decisionCommandValid = (
  command: Readonly<{
    proposalId: string;
    locationId: string;
    expectedVersion: number;
    idempotencyKey: string;
    context: Parameters<AcceptIncomingOrderProposal>[0]['context'];
    reasonNote: string | null;
  }>,
): boolean =>
  command.proposalId.trim() !== '' &&
  command.locationId.trim() !== '' &&
  Number.isInteger(command.expectedVersion) &&
  command.expectedVersion > 0 &&
  command.idempotencyKey.trim() !== '' &&
  isCommandContextValid(command.context) &&
  (command.reasonNote === null || command.reasonNote.trim() !== '');

const rejectReasonCodes = new Set([
  'already_handled',
  'duplicate_order',
  'not_pressly_work',
  'manager_rejected',
]);

const loadCurrentProposal = async (
  operations: DecideIncomingOrderProposalOperations,
  proposalId: string,
): Promise<StoredIncomingOrderProposal | null> => {
  const discovered = await operations.loadProposal(proposalId);
  if (discovered === null) return null;
  await operations.lockSource(discovered.source, discovered.externalOrderId);
  await operations.lockProposal(proposalId);
  return operations.loadProposal(proposalId);
};

const replayedResolution = async (
  operations: DecideIncomingOrderProposalOperations,
  idempotencyKey: string,
  commandHash: string,
): Promise<
  | Readonly<{
      kind: 'replay';
      value: IncomingOrderProposalDecisionResult;
    }>
  | Readonly<{ kind: 'conflict' }>
  | null
> => {
  const receipt =
    await operations.loadResolutionByIdempotencyKey(idempotencyKey);
  if (receipt === null) return null;
  return receipt.commandHash === commandHash
    ? {
        kind: 'replay',
        value: decisionResultFromResolution(receipt.proposalId, receipt, true),
      }
    : { kind: 'conflict' };
};

export const makeAcceptIncomingOrderProposal = (deps: {
  repo: DecideIncomingOrderProposalRepository;
  clock: OrderClockPort;
}): AcceptIncomingOrderProposal => {
  return async (command) => {
    if (
      !decisionCommandValid(command) ||
      command.reasonCode !== 'incoming_order_accepted'
    )
      return result.err(
        orderError(
          'INCOMING_ORDER_PROPOSAL_ACCEPT_INVALID',
          'The incoming Order acceptance is incomplete.',
          400,
        ),
      );
    try {
      const commandHash = hashOrderCommand(command);
      const now = deps.clock.now();
      const outcome = await deps.repo.transaction(async (operations) => {
        await operations.lockCommand(command.idempotencyKey);
        const receipt = await replayedResolution(
          operations,
          command.idempotencyKey,
          commandHash,
        );
        if (receipt !== null) return receipt;
        const canonicalReceipt =
          await operations.loadCanonicalOrderCommandReceipt(
            command.idempotencyKey,
          );
        if (canonicalReceipt !== null) {
          if (canonicalReceipt.commandHash !== commandHash)
            return { kind: 'conflict' as const };
          throw new Error(
            'Canonical Order receipt exists without its proposal resolution.',
          );
        }
        const proposal = await loadCurrentProposal(
          operations,
          command.proposalId,
        );
        if (proposal === null || proposal.locationId !== command.locationId)
          return { kind: 'not_found' as const };
        const proposalDecision = decideIncomingOrderProposal(
          proposal.state,
          'accept',
        );
        if (proposalDecision.kind === 'denied')
          return { kind: 'invalid_transition' as const };
        if (proposal.version !== command.expectedVersion)
          return { kind: 'version_conflict' as const };
        const linked = await operations.findExactOrder(
          proposal.source,
          proposal.externalOrderId,
        );
        if (linked !== null) return { kind: 'identity_conflict' as const };
        const customer = await operations.resolveOrCreateExactCustomer(
          proposal,
          now,
          command.context,
        );
        const created = await operations.acceptProposal({
          proposal,
          idempotencyKey: command.idempotencyKey,
          commandHash,
          context: command.context,
          reasonCode: command.reasonCode,
          reasonNote: command.reasonNote,
          decidedAt: now,
          customer,
          canonical: { state: 'open', releaseState: 'unreleased' },
          transition: {
            from: proposalDecision.from as 'pending' | 'restored_pending',
            to: 'accepted',
            event: 'accept',
            version: proposal.version + 1,
          },
        });
        return {
          kind: 'ok' as const,
          value: {
            proposalId: proposal.id,
            state: 'accepted' as const,
            version: proposal.version + 1,
            orderId: created.orderId,
            fulfillmentId: created.fulfillmentId,
            replayed: false,
          },
        };
      });
      if (outcome.kind === 'ok' || outcome.kind === 'replay')
        return result.ok(outcome.value);
      if (outcome.kind === 'not_found')
        return result.err(
          orderError(
            'INCOMING_ORDER_PROPOSAL_NOT_FOUND',
            'The incoming Order proposal was not found.',
            404,
          ),
        );
      if (outcome.kind === 'version_conflict')
        return result.err(
          orderError(
            'INCOMING_ORDER_PROPOSAL_VERSION_CONFLICT',
            'The incoming Order proposal changed after this request was prepared.',
          ),
        );
      if (outcome.kind === 'invalid_transition')
        return result.err(
          orderError(
            'INCOMING_ORDER_PROPOSAL_TRANSITION_INVALID',
            'The incoming Order proposal has already been decided.',
          ),
        );
      if (outcome.kind === 'identity_conflict')
        return result.err(
          orderError(
            'INCOMING_ORDER_PROPOSAL_IDENTITY_CONFLICT',
            'This exact source Order is already linked to Pressly.',
          ),
        );
      return result.err(
        orderError(
          'ORDER_IDEMPOTENCY_CONFLICT',
          'The idempotency key belongs to a different Order command.',
        ),
      );
    } catch (error) {
      return result.err(
        orderError(
          'INCOMING_ORDER_PROPOSAL_ACCEPT_FAILED',
          'The incoming Order proposal could not be accepted.',
          503,
          error,
        ),
      );
    }
  };
};

export const makeRejectIncomingOrderProposal = (deps: {
  repo: DecideIncomingOrderProposalRepository;
  clock: OrderClockPort;
}): RejectIncomingOrderProposal => {
  return async (command) => {
    if (
      !decisionCommandValid(command) ||
      !rejectReasonCodes.has(command.reasonCode)
    )
      return result.err(
        orderError(
          'INCOMING_ORDER_PROPOSAL_REJECT_INVALID',
          'The incoming Order rejection is incomplete.',
          400,
        ),
      );
    try {
      const commandHash = hashOrderCommand(command);
      const now = deps.clock.now();
      const outcome = await deps.repo.transaction(async (operations) => {
        await operations.lockCommand(command.idempotencyKey);
        const receipt = await replayedResolution(
          operations,
          command.idempotencyKey,
          commandHash,
        );
        if (receipt !== null) return receipt;
        const canonicalReceipt =
          await operations.loadCanonicalOrderCommandReceipt(
            command.idempotencyKey,
          );
        if (canonicalReceipt !== null) return { kind: 'conflict' as const };
        const proposal = await loadCurrentProposal(
          operations,
          command.proposalId,
        );
        if (proposal === null || proposal.locationId !== command.locationId)
          return { kind: 'not_found' as const };
        const proposalDecision = decideIncomingOrderProposal(
          proposal.state,
          'reject',
        );
        if (proposalDecision.kind === 'denied')
          return { kind: 'invalid_transition' as const };
        if (proposal.version !== command.expectedVersion)
          return { kind: 'version_conflict' as const };
        await operations.rejectProposal({
          proposal,
          idempotencyKey: command.idempotencyKey,
          commandHash,
          context: command.context,
          reasonCode: command.reasonCode,
          reasonNote: command.reasonNote,
          decidedAt: now,
          transition: {
            from: proposalDecision.from as 'pending' | 'restored_pending',
            to: 'rejected',
            event: 'reject',
            version: proposal.version + 1,
          },
        });
        return {
          kind: 'ok' as const,
          value: {
            proposalId: proposal.id,
            state: 'rejected' as const,
            version: proposal.version + 1,
            orderId: null,
            fulfillmentId: null,
            replayed: false,
          },
        };
      });
      if (outcome.kind === 'ok' || outcome.kind === 'replay')
        return result.ok(outcome.value);
      if (outcome.kind === 'not_found')
        return result.err(
          orderError(
            'INCOMING_ORDER_PROPOSAL_NOT_FOUND',
            'The incoming Order proposal was not found.',
            404,
          ),
        );
      if (outcome.kind === 'version_conflict')
        return result.err(
          orderError(
            'INCOMING_ORDER_PROPOSAL_VERSION_CONFLICT',
            'The incoming Order proposal changed after this request was prepared.',
          ),
        );
      if (outcome.kind === 'invalid_transition')
        return result.err(
          orderError(
            'INCOMING_ORDER_PROPOSAL_TRANSITION_INVALID',
            'The incoming Order proposal has already been decided.',
          ),
        );
      return result.err(
        orderError(
          'ORDER_IDEMPOTENCY_CONFLICT',
          'The idempotency key belongs to a different Order command.',
        ),
      );
    } catch (error) {
      return result.err(
        orderError(
          'INCOMING_ORDER_PROPOSAL_REJECT_FAILED',
          'The incoming Order proposal could not be rejected.',
          503,
          error,
        ),
      );
    }
  };
};

export const makeRestoreIncomingOrderProposal = (deps: {
  repo: DecideIncomingOrderProposalRepository;
  clock: OrderClockPort;
}): RestoreIncomingOrderProposal => {
  return async (command) => {
    if (
      !decisionCommandValid(command) ||
      command.reasonCode !== 'source_closure_overridden'
    )
      return result.err(
        orderError(
          'INCOMING_ORDER_PROPOSAL_RESTORE_INVALID',
          'The incoming Order restore command is incomplete.',
          400,
        ),
      );
    try {
      const commandHash = hashOrderCommand(command);
      const now = deps.clock.now();
      const outcome = await deps.repo.transaction(async (operations) => {
        await operations.lockCommand(command.idempotencyKey);
        const replay = await operations.loadTransitionByIdempotencyKey(
          command.idempotencyKey,
        );
        if (replay !== null)
          return replay.commandHash === commandHash &&
            replay.event === 'restore' &&
            replay.to === 'restored_pending'
            ? {
                kind: 'ok' as const,
                value: {
                  proposalId: replay.proposalId,
                  state: 'restored_pending' as const,
                  version: replay.proposalVersion,
                  replayed: true,
                },
              }
            : { kind: 'conflict' as const };

        const proposal = await loadCurrentProposal(
          operations,
          command.proposalId,
        );
        if (proposal === null || proposal.locationId !== command.locationId)
          return { kind: 'not_found' as const };
        const decision = decideIncomingOrderProposal(proposal.state, 'restore');
        if (
          decision.kind === 'denied' ||
          decision.from !== 'source_closed' ||
          decision.to !== 'restored_pending'
        )
          return { kind: 'invalid_transition' as const };
        if (proposal.version !== command.expectedVersion)
          return { kind: 'version_conflict' as const };
        return {
          kind: 'ok' as const,
          value: await operations.restoreProposal({
            proposal,
            idempotencyKey: command.idempotencyKey,
            commandHash,
            context: command.context,
            reasonCode: command.reasonCode,
            reasonNote: command.reasonNote,
            restoredAt: now,
            transition: {
              from: 'source_closed',
              to: 'restored_pending',
              event: 'restore',
              version: proposal.version + 1,
            },
          }),
        };
      });
      if (outcome.kind === 'ok') return result.ok(outcome.value);
      if (outcome.kind === 'not_found')
        return result.err(
          orderError(
            'INCOMING_ORDER_PROPOSAL_NOT_FOUND',
            'The incoming Order proposal was not found.',
            404,
          ),
        );
      if (outcome.kind === 'version_conflict')
        return result.err(
          orderError(
            'INCOMING_ORDER_PROPOSAL_VERSION_CONFLICT',
            'The incoming Order proposal changed after this request was prepared.',
          ),
        );
      if (outcome.kind === 'invalid_transition')
        return result.err(
          orderError(
            'INCOMING_ORDER_PROPOSAL_TRANSITION_INVALID',
            'Only a source-closed candidate can be restored.',
          ),
        );
      return result.err(
        orderError(
          'ORDER_IDEMPOTENCY_CONFLICT',
          'The idempotency key belongs to a different Order command.',
        ),
      );
    } catch (error) {
      return result.err(
        orderError(
          'INCOMING_ORDER_PROPOSAL_RESTORE_FAILED',
          'The incoming Order proposal could not be restored.',
          503,
          error,
        ),
      );
    }
  };
};

export { allowedIncomingOrderProposalEvents };
