import type { CellOutcome } from '@pressly/cells';
import { canonicalSha256 } from '@pressly/codec/node';
import { mapUnknownError } from '@pressly/errors/app-error';
import {
  databaseError,
  invariantViolationError,
} from '@pressly/errors/factories';
import { decideIncomingOrderProposal } from '../../../model/incoming-order-proposal/lifecycle.ts';
import type { IncomingOrderSourceTombstone } from '../../../model/incoming-order-proposal/model.ts';
import {
  closeIncomingOrderSourceFailure,
  validateCloseIncomingOrderSource,
} from './decide.ts';
import type {
  CloseIncomingOrderSourceClock,
  CloseIncomingOrderSourceCommand,
  CloseIncomingOrderSourceExpectedFailure,
  CloseIncomingOrderSourceRepository,
  CloseIncomingOrderSourceResult,
} from './types.ts';

export const closeIncomingOrderSourceIdempotencyKey = (
  command: CloseIncomingOrderSourceCommand,
): string =>
  [
    'incoming-order-source-close',
    command.source,
    command.externalOrderId,
    command.revision.hash,
  ].join(':');

export const closeIncomingOrderSourceCommandHash = (
  command: CloseIncomingOrderSourceCommand,
): string =>
  canonicalSha256({
    source: command.source,
    externalOrderId: command.externalOrderId,
    terminalCode: command.terminalCode,
    revision: command.revision,
  });

const storedTerminalEvidenceHash = (
  tombstone: IncomingOrderSourceTombstone,
): string =>
  canonicalSha256({
    source: tombstone.source,
    externalOrderId: tombstone.externalOrderId,
    terminalCode: tombstone.terminalCode,
    revision: {
      at: tombstone.sourceRevisionAt,
      hash: tombstone.sourceRevisionHash,
      adapterVersion: tombstone.adapterVersion,
      observedAt: tombstone.observedAt,
      normalizedPayload: tombstone.normalizedPayload,
    },
  });

export type CloseIncomingOrderSourceDependencies = Readonly<{
  repo: CloseIncomingOrderSourceRepository;
  clock: CloseIncomingOrderSourceClock;
}>;

export type ExecuteCloseIncomingOrderSource = (
  command: CloseIncomingOrderSourceCommand,
) => Promise<
  CellOutcome<
    CloseIncomingOrderSourceResult,
    CloseIncomingOrderSourceExpectedFailure
  >
>;

export const makeExecuteCloseIncomingOrderSource =
  (
    dependencies: CloseIncomingOrderSourceDependencies,
  ): ExecuteCloseIncomingOrderSource =>
  async (command) => {
    const expectedFailure = validateCloseIncomingOrderSource(command);
    if (expectedFailure !== null)
      return { kind: 'failure', failure: expectedFailure };

    try {
      const commandHash = closeIncomingOrderSourceCommandHash(command);
      const idempotencyKey = closeIncomingOrderSourceIdempotencyKey(command);
      const closedAt = dependencies.clock.now();
      const value = await dependencies.repo.transaction(async (repository) => {
        await repository.lockSource(command.source, command.externalOrderId);

        const discovered = await repository.findProposal(
          command.source,
          command.externalOrderId,
        );
        if (discovered !== null) await repository.lockProposal(discovered.id);

        const proposal = await repository.findProposal(
          command.source,
          command.externalOrderId,
        );
        const existingTombstone = await repository.findTombstone(
          command.source,
          command.externalOrderId,
        );
        if (
          existingTombstone !== null &&
          storedTerminalEvidenceHash(existingTombstone) !== commandHash
        )
          return { kind: 'idempotency_conflict' as const };
        const tombstone =
          existingTombstone ??
          (await repository.createTombstone(command, proposal?.id ?? null));
        const canonical = await repository.findExactOrder(
          command.source,
          command.externalOrderId,
        );

        if (canonical !== null)
          return {
            outcome: 'existing_order' as const,
            proposalId: proposal?.id ?? tombstone.proposalId,
            version: proposal?.version ?? null,
            canonical:
              canonical.fulfillment === null
                ? null
                : {
                    orderId: canonical.orderId,
                    ...canonical.fulfillment,
                  },
            replayed: existingTombstone !== null,
          };

        if (proposal === null)
          return {
            outcome: 'tombstoned' as const,
            proposalId: null,
            version: null,
            canonical: null,
            replayed: existingTombstone !== null,
          };

        if (proposal.state === 'source_closed')
          return {
            outcome: 'already_source_closed' as const,
            proposalId: proposal.id,
            version: proposal.version,
            canonical: null,
            replayed: true,
          };

        if (proposal.state !== 'pending')
          return {
            outcome: 'already_decided' as const,
            proposalId: proposal.id,
            version: proposal.version,
            canonical: null,
            replayed: true,
          };

        const decision = decideIncomingOrderProposal(
          proposal.state,
          'source_close',
        );
        if (
          decision.kind === 'denied' ||
          decision.from !== 'pending' ||
          decision.to !== 'source_closed'
        )
          throw invariantViolationError({
            code: 'incoming_order_source_close_graph_state_invalid',
            message:
              'Incoming candidate graph denied a valid source-close transition.',
            safeMessage: 'Stored order data is inconsistent.',
          });

        return repository.closeProposal({
          proposal,
          command,
          idempotencyKey,
          commandHash,
          closedAt,
          transition: {
            from: 'pending',
            to: 'source_closed',
            event: 'source_close',
            version: proposal.version + 1,
          },
        });
      });

      if ('kind' in value)
        return {
          kind: 'failure',
          failure: closeIncomingOrderSourceFailure.idempotencyConflict(),
        };
      return { kind: 'success', value };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'incoming_order_source_close_failed',
          message: 'The source-terminal observation could not be recorded.',
          safeMessage: 'The source-terminal observation could not be recorded.',
          status: 503,
          cause,
        }),
      );
    }
  };
