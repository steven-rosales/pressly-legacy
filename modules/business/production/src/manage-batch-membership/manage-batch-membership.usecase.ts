import type { ProductionBatchMembershipMutationResult } from '@pressly/contracts';
import { result } from '@pressly/kernel';
import {
  productionError,
  productionIdempotencyConflict,
} from '../production.error.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../production-idempotency.policy.ts';
import type { ClockPort, ProductionPolicyPort } from '../production.port.ts';
import type {
  ManageBatchMembership,
  ManageBatchMembershipRepository,
} from './manage-batch-membership.port.ts';
export type { ManageBatchMembership } from './manage-batch-membership.port.ts';

const eventFor = (action: 'freeze' | 'unfreeze') =>
  action === 'freeze' ? 'batch_membership_frozen' : 'batch_membership_unfrozen';

export const makeManageBatchMembership = (deps: {
  repo: ManageBatchMembershipRepository;
  policy: ProductionPolicyPort;
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
            productionError(
              'PRODUCTION_BATCH_NOT_FOUND',
              'The production batch was not found in this run.',
              404,
            ),
          );
        if (context.productionRun.status !== 'started')
          return result.err(
            productionError(
              'PRODUCTION_RUN_NOT_STARTED',
              'Batch membership can only change on a started production run.',
            ),
          );
        if (context.productionRun.queueVersion !== command.expectedQueueVersion)
          return result.err(
            productionError(
              'PRODUCTION_QUEUE_VERSION_CONFLICT',
              'The production queue changed before the command.',
            ),
          );
        if (context.productionBatch.version !== command.expectedBatchVersion)
          return result.err(
            productionError(
              'PRODUCTION_BATCH_VERSION_CONFLICT',
              'The production batch changed before the command.',
            ),
          );

        const decision = deps.policy.evaluateBatchMembershipTransition({
          action: command.action,
          batchStatus: context.productionBatch.status,
          membershipFrozen: context.productionBatch.membershipFrozenAt !== null,
          actorRole: command.actorRole,
        });
        if (decision.tag === 'err')
          return result.err(
            productionError(decision.error.code, decision.error.message),
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
            queueVersion: mutation.queueVersion,
            batchVersion: mutation.batchVersion,
          },
          idempotency: { command: idempotency, result: mutation },
        });

        return result.ok(mutation);
      });
    } catch (error) {
      return result.err(
        productionError(
          'BATCH_MEMBERSHIP_CHANGE_FAILED',
          'Production batch membership could not be changed.',
          500,
          error,
        ),
      );
    }
  };
