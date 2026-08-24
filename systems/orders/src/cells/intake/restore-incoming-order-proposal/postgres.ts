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
import type { OrdersSchema } from '../../../schema/orders.ts';
import {
  appendIncomingOrderProposalTransition,
  loadIncomingOrderProposal,
  loadIncomingOrderProposalTransitionByIdempotencyKey,
  lockIncomingOrderCommand,
  lockIncomingOrderProposal,
  lockIncomingOrderSource,
} from '../../../postgres/incoming-order-proposal/incoming-order-proposal.postgres.ts';
import type {
  RestoreIncomingOrderProposalCommand,
  RestoreIncomingOrderProposalExpectedFailure,
  RestoreIncomingOrderProposalResult,
} from './types.ts';

const failure = Object.freeze({
  invalid: (): RestoreIncomingOrderProposalExpectedFailure => ({
    kind: 'validation',
    code: 'incoming_order_proposal_restore_invalid',
    message: 'The incoming Order restore command is incomplete.',
  }),
  notFound: (): RestoreIncomingOrderProposalExpectedFailure => ({
    kind: 'not_found',
    code: 'incoming_order_proposal_not_found',
    message: 'The incoming Order proposal was not found.',
  }),
  versionConflict: (): RestoreIncomingOrderProposalExpectedFailure => ({
    kind: 'conflict',
    code: 'incoming_order_proposal_version_conflict',
    message:
      'The incoming Order proposal changed after this request was prepared.',
  }),
  invalidTransition: (): RestoreIncomingOrderProposalExpectedFailure => ({
    kind: 'conflict',
    code: 'incoming_order_proposal_transition_invalid',
    message: 'Only a source-closed candidate can be restored.',
  }),
  idempotencyConflict: (): RestoreIncomingOrderProposalExpectedFailure => ({
    kind: 'conflict',
    code: 'order_idempotency_conflict',
    message: 'The idempotency key belongs to a different Order command.',
  }),
});

export const makeRestoreIncomingOrderProposalPostgresWriter =
  (dependencies: {
    db: PostgresDatabase;
    schema: OrdersSchema;
    clock: Clock;
  }) =>
  async (
    command: RestoreIncomingOrderProposalCommand,
  ): Promise<
    CellOutcome<
      RestoreIncomingOrderProposalResult,
      RestoreIncomingOrderProposalExpectedFailure
    >
  > => {
    const orders = dependencies.schema;
    if (
      !incomingOrderProposalDecisionCommandValid(command) ||
      command.reasonCode !== 'source_closure_overridden'
    )
      return { kind: 'failure', failure: failure.invalid() };
    try {
      const commandHash = hashOrderCommand(command);
      const now = dependencies.clock.now();
      const outcome = await dependencies.db.transaction(async (transaction) => {
        await lockIncomingOrderCommand(transaction, command.idempotencyKey);
        const replay =
          await loadIncomingOrderProposalTransitionByIdempotencyKey(
            transaction,
            orders,
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
        const decision = decideIncomingOrderProposal(proposal.state, 'restore');
        if (
          decision.kind === 'denied' ||
          decision.from !== 'source_closed' ||
          decision.to !== 'restored_pending'
        )
          return { kind: 'invalid_transition' as const };
        if (proposal.version !== command.expectedVersion)
          return { kind: 'version_conflict' as const };
        const version = proposal.version + 1;
        await appendIncomingOrderProposalTransition(transaction, orders, {
          proposalId: proposal.id,
          expectedVersion: proposal.version,
          transition: {
            from: 'source_closed',
            to: 'restored_pending',
            event: 'restore',
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
        return {
          kind: 'ok' as const,
          value: {
            proposalId: proposal.id,
            state: 'restored_pending' as const,
            version,
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
          code: 'incoming_order_proposal_restore_failed',
          message: 'The incoming Order proposal could not be restored.',
          safeMessage: 'The incoming Order proposal could not be restored.',
          status: 503,
          cause,
        }),
      );
    }
  };
