import type { CellOutcome } from '@pressly/cells';
import type { PostgresDatabase } from '@pressly/postgres/client';
import type { Clock } from '@pressly/time';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { hashOrderCommand } from '../../../model/canonical-order/policy.ts';
import {
  decideIncomingOrderProposal,
  incomingOrderProposalDecisionCommandValid,
} from '../../../model/incoming-order-proposal/lifecycle.ts';
import type { IncomingOrderProposalDecisionResult } from '../../../model/incoming-order-proposal/model.ts';
import type { OrdersSchema } from '../../../schema/orders.ts';
import { loadOrderCommandReceipt } from '../../../postgres/canonical-order/canonical-order.postgres.ts';
import {
  appendIncomingOrderProposalTransition,
  insertIncomingOrderProposalResolution,
  loadIncomingOrderProposal,
  loadIncomingOrderProposalResolutionByIdempotencyKey,
  lockIncomingOrderCommand,
  lockIncomingOrderProposal,
  lockIncomingOrderSource,
} from '../../../postgres/incoming-order-proposal/incoming-order-proposal.postgres.ts';
import type {
  RejectIncomingOrderProposalCommand,
  RejectIncomingOrderProposalExpectedFailure,
} from './types.ts';

const failure = Object.freeze({
  invalid: (): RejectIncomingOrderProposalExpectedFailure => ({
    kind: 'validation',
    code: 'incoming_order_proposal_reject_invalid',
    message: 'The incoming Order rejection is incomplete.',
  }),
  notFound: (): RejectIncomingOrderProposalExpectedFailure => ({
    kind: 'not_found',
    code: 'incoming_order_proposal_not_found',
    message: 'The incoming Order proposal was not found.',
  }),
  versionConflict: (): RejectIncomingOrderProposalExpectedFailure => ({
    kind: 'conflict',
    code: 'incoming_order_proposal_version_conflict',
    message:
      'The incoming Order proposal changed after this request was prepared.',
  }),
  invalidTransition: (): RejectIncomingOrderProposalExpectedFailure => ({
    kind: 'conflict',
    code: 'incoming_order_proposal_transition_invalid',
    message: 'The incoming Order proposal has already been decided.',
  }),
  idempotencyConflict: (): RejectIncomingOrderProposalExpectedFailure => ({
    kind: 'conflict',
    code: 'order_idempotency_conflict',
    message: 'The idempotency key belongs to a different Order command.',
  }),
});

export const makeRejectIncomingOrderProposalPostgresWriter =
  (dependencies: {
    db: PostgresDatabase;
    schema: OrdersSchema;
    clock: Clock;
  }) =>
  async (
    command: RejectIncomingOrderProposalCommand,
  ): Promise<
    CellOutcome<
      IncomingOrderProposalDecisionResult,
      RejectIncomingOrderProposalExpectedFailure
    >
  > => {
    const orders = dependencies.schema;
    if (
      !incomingOrderProposalDecisionCommandValid(command) ||
      ![
        'already_handled',
        'duplicate_order',
        'not_pressly_work',
        'manager_rejected',
      ].some((reason) => reason === command.reasonCode)
    )
      return { kind: 'failure', failure: failure.invalid() };
    try {
      const commandHash = hashOrderCommand(command);
      const now = dependencies.clock.now();
      const outcome = await dependencies.db.transaction(async (transaction) => {
        await lockIncomingOrderCommand(transaction, command.idempotencyKey);
        const resolution =
          await loadIncomingOrderProposalResolutionByIdempotencyKey(
            transaction,
            orders,
            command.idempotencyKey,
          );
        if (resolution !== null)
          return resolution.commandHash === commandHash
            ? {
                kind: 'ok' as const,
                value: {
                  proposalId: resolution.proposalId,
                  state: resolution.decision,
                  version: resolution.proposalVersion,
                  orderId: resolution.orderId,
                  fulfillmentId: resolution.fulfillmentId,
                  replayed: true,
                },
              }
            : { kind: 'conflict' as const };

        if (
          (await loadOrderCommandReceipt(
            transaction,
            orders,
            command.idempotencyKey,
          )) !== null
        )
          return { kind: 'conflict' as const };

        const discovered = await loadIncomingOrderProposal(
          transaction,
          orders,
          command.proposalId,
        );
        if (discovered !== null) {
          await lockIncomingOrderSource(
            transaction,
            discovered.source,
            discovered.externalOrderId,
          );
          await lockIncomingOrderProposal(
            transaction,
            orders,
            command.proposalId,
          );
        }
        const proposal =
          discovered === null
            ? null
            : await loadIncomingOrderProposal(
                transaction,
                orders,
                command.proposalId,
              );
        if (proposal === null || proposal.locationId !== command.locationId)
          return { kind: 'not_found' as const };
        const decision = decideIncomingOrderProposal(proposal.state, 'reject');
        if (decision.kind === 'denied')
          return { kind: 'invalid_transition' as const };
        if (proposal.version !== command.expectedVersion)
          return { kind: 'version_conflict' as const };
        const version = proposal.version + 1;
        await appendIncomingOrderProposalTransition(transaction, orders, {
          proposalId: proposal.id,
          expectedVersion: proposal.version,
          transition: {
            from: decision.from as 'pending' | 'restored_pending',
            to: 'rejected',
            event: 'reject',
            version,
          },
          idempotencyKey: command.idempotencyKey,
          commandHash,
          context: command.context,
          reasonCode: command.reasonCode,
          reasonNote: command.reasonNote,
          sourceTerminalCode: null,
          occurredAt: now,
        });
        await insertIncomingOrderProposalResolution(transaction, orders, {
          proposalId: proposal.id,
          decision: 'rejected',
          proposalVersion: version,
          orderId: null,
          fulfillmentId: null,
          idempotencyKey: command.idempotencyKey,
          commandHash,
          context: command.context,
          reasonCode: command.reasonCode,
          reasonNote: command.reasonNote,
          decidedAt: now,
        });
        return {
          kind: 'ok' as const,
          value: {
            proposalId: proposal.id,
            state: 'rejected' as const,
            version,
            orderId: null,
            fulfillmentId: null,
            replayed: false,
          },
        };
      });
      if (outcome.kind === 'ok')
        return { kind: 'success', value: outcome.value };
      if (outcome.kind === 'not_found')
        return { kind: 'failure', failure: failure.notFound() };
      if (outcome.kind === 'version_conflict')
        return { kind: 'failure', failure: failure.versionConflict() };
      if (outcome.kind === 'invalid_transition')
        return { kind: 'failure', failure: failure.invalidTransition() };
      return { kind: 'failure', failure: failure.idempotencyConflict() };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'incoming_order_proposal_reject_failed',
          message: 'The incoming Order proposal could not be rejected.',
          safeMessage: 'The incoming Order proposal could not be rejected.',
          status: 503,
          cause,
        }),
      );
    }
  };
