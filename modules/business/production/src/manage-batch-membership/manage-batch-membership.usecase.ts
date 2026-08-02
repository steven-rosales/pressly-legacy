import {
  conflictError,
  databaseError,
  mapUnknownError,
  notFoundError,
} from '@pressly/errors';
import type { ProductionBatchMembershipMutationResult } from '@pressly/contracts';
import { result } from '@pressly/kernel';
import { productionIdempotencyConflict } from '../command-execution/production-command.error.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../command-execution/production-idempotency.policy.ts';
import type { ClockPort } from '../command-execution/production-command.port.ts';
import type { ProductionPolicyPort } from '../production-policy/production-policy.port.ts';
import type {
  ManageBatchMembership,
  ManageBatchMembershipRepository,
} from './manage-batch-membership.port.ts';
export type { ManageBatchMembership } from './manage-batch-membership.port.ts';

const eventFor = (action: 'freeze' | 'unfreeze') =>
  action === 'freeze' ? 'batch_membership_frozen' : 'batch_membership_unfrozen';

export const makeManageBatchMembership = (deps: {
  repo: ManageBatchMembershipRepository;
  policy: Pick<ProductionPolicyPort, 'evaluateBatchMembershipTransition'>;
  clock: ClockPort;
}): ManageBatchMembership =>
  async function manageBatchMembership(command) {
    try {
      return await deps.repo.transaction(async (repo) => {
        const eventType = eventFor(command.action);
        const idempotency = defineWorkEventCommand({
          operation: eventType,
          locationId: command.locationId,
          actorId: command.actorId,
          entityType: 'production_batch',
          entityId: command.productionBatchId,
          expectedVersion: command.expectedBatchVersion,
          payload: {
            action: command.action,
            expectedQueueVersion: command.expectedQueueVersion,
          },
        });
        const replay =
          resolveWorkEventReplay<ProductionBatchMembershipMutationResult>(
            await repo.findWorkEvent(command.idempotencyKey),
            idempotency,
          );
        if (replay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replay.tag === 'replay') return result.ok(replay.result);

        const context = await repo.lockBatchMembershipContext(
          command.locationId,
          command.productionRunId,
          command.productionBatchId,
        );
        const replayAfterLock =
          resolveWorkEventReplay<ProductionBatchMembershipMutationResult>(
            await repo.findWorkEvent(command.idempotencyKey),
            idempotency,
          );
        if (replayAfterLock.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replayAfterLock.tag === 'replay')
          return result.ok(replayAfterLock.result);
        if (context === null)
          return result.err(
            notFoundError({
              code: 'production_batch_not_found',
              message: 'The production batch was not found in this run.',
              safeMessage: 'The production batch was not found in this run.',
            }),
          );
        if (context.productionRun.status !== 'started')
          return result.err(
            conflictError({
              code: 'production_run_not_started',
              message:
                'Batch membership can only change on a started production run.',
              safeMessage:
                'Batch membership can only change on a started production run.',
            }),
          );
        if (context.productionRun.queueVersion !== command.expectedQueueVersion)
          return result.err(
            conflictError({
              code: 'production_queue_version_conflict',
              message: 'The production queue changed before the command.',
              safeMessage: 'The production queue changed before the command.',
            }),
          );
        if (context.productionBatch.version !== command.expectedBatchVersion)
          return result.err(
            conflictError({
              code: 'production_batch_version_conflict',
              message: 'The production batch changed before the command.',
              safeMessage: 'The production batch changed before the command.',
            }),
          );

        const decision = deps.policy.evaluateBatchMembershipTransition({
          action: command.action,
          batchStatus: context.productionBatch.status,
          membershipFrozen: context.productionBatch.membershipFrozenAt !== null,
          authorizedAction: command.authorizedAction,
        });
        if (decision.tag === 'err')
          return result.err(
            conflictError({
              code: decision.error.code.toLowerCase(),
              message: decision.error.message,
              safeMessage: decision.error.message,
            }),
          );

        const now = deps.clock.now();
        const mutation = await repo.changeBatchMembership({
          action: command.action,
          locationId: command.locationId,
          productionRunId: command.productionRunId,
          productionBatchId: command.productionBatchId,
          expectedQueueVersion: command.expectedQueueVersion,
          expectedBatchVersion: command.expectedBatchVersion,
          actorId: command.actorId,
          now,
        });

        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType,
          entityType: 'production_batch',
          entityId: command.productionBatchId,
          actorId: command.actorId,
          expectedVersion: command.expectedBatchVersion,
          idempotencyKey: command.idempotencyKey,
          payload: {
            action: command.action,
            authorizedAction: command.authorizedAction,
            queueVersion: mutation.queueVersion,
            batchVersion: mutation.batchVersion,
          },
          idempotency: { command: idempotency, result: mutation },
        });

        return result.ok(mutation);
      });
    } catch (error) {
      return result.err(
        mapUnknownError(error, (unknownCause) =>
          databaseError({
            code: 'batch_membership_change_failed',
            message: 'Production batch membership could not be changed.',
            safeMessage: 'Production batch membership could not be changed.',
            status: 503,
            cause: unknownCause,
          }),
        ),
      );
    }
  };
