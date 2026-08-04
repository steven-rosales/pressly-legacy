import {
  conflictFailure,
  notFoundFailure,
  isProductionFeatureFailure,
} from '../../../foundations/language/failures/production-failure.factory.ts';
import { databaseError } from '@pressly/errors/factories';
import { mapUnknownError } from '@pressly/errors/app-error';
import { result } from '@pressly/kernel';
import type { ProductionMutationResult } from '../../../foundations/language/commands/production-mutation.model.ts';
import { productionIdempotencyConflict } from '../../../foundations/language/commands/production-command.failure.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../../../foundations/language/commands/production-idempotency.policy.ts';
import type { Clock } from '@pressly/time';
import type { ProductionRules } from '../../../foundations/language/rules/production-rules.factory.ts';
import type {
  AssignStageMachines,
  AssignStageMachinesRepository,
} from './assign-stage-machines.port.ts';
export type { AssignStageMachines } from './assign-stage-machines.port.ts';

export const makeAssignStageMachines =
  (deps: {
    repo: AssignStageMachinesRepository;
    policy: Pick<ProductionRules, 'evaluateMachineAssignment'>;
    clock: Clock;
  }): AssignStageMachines =>
  async (command) => {
    try {
      return await deps.repo.transaction(async (repo) => {
        const idempotency = defineWorkEventCommand({
          operation: 'machine_assigned',
          locationId: command.locationId,
          actorId: command.actorId,
          entityType: 'stage_run',
          entityId: command.stageRunId,
          expectedVersion: command.expectedVersion,
          payload: { machineIds: [...command.machineIds] },
        });
        const replay = resolveWorkEventReplay<ProductionMutationResult>(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (replay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replay.tag === 'replay') return result.ok(replay.result);

        const context = await repo.loadStageTransitionContext(
          command.locationId,
          command.stageRunId,
          deps.clock.now(),
        );
        if (context === null)
          return result.err(
            notFoundFailure({
              code: 'stage_run_not_found',
              message: 'The production stage was not found.',
              safeMessage: 'The production stage was not found.',
            }),
          );
        if (
          context.stage.status !== 'planned' ||
          context.stage.version !== command.expectedVersion
        )
          return result.err(
            conflictFailure({
              code: 'stage_run_version_conflict',
              message: 'The production stage changed before assignment.',
              safeMessage: 'The production stage changed before assignment.',
            }),
          );

        const machines = context.machines.filter((machine) =>
          command.machineIds.includes(machine.id),
        );
        if (machines.length !== command.machineIds.length)
          return result.err(
            notFoundFailure({
              code: 'machine_not_found',
              message: 'One or more requested machines are not available.',
              safeMessage: 'One or more requested machines are not available.',
            }),
          );

        const decision = deps.policy.evaluateMachineAssignment({
          stageKind: context.stage.stage,
          batchWeightLbs: context.batchWeightLbs,
          machines,
        });
        if (decision.tag === 'err')
          return result.err(
            conflictFailure({
              code: decision.error.code.toLowerCase(),
              message: decision.error.message,
              safeMessage: decision.error.message,
            }),
          );

        const mutation = await repo.assignStageMachines({
          locationId: command.locationId,
          stageRunId: command.stageRunId,
          expectedVersion: command.expectedVersion,
          machineIds: decision.value.machineIds,
          now: deps.clock.now(),
        });
        if (mutation === null)
          return result.err(
            conflictFailure({
              code: 'stage_run_version_conflict',
              message: 'The production stage changed before assignment.',
              safeMessage: 'The production stage changed before assignment.',
            }),
          );

        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'machine_assigned',
          entityType: 'stage_run',
          entityId: command.stageRunId,
          actorId: command.actorId,
          expectedVersion: command.expectedVersion,
          idempotencyKey: command.idempotencyKey,
          payload: {
            machineIds: [...decision.value.machineIds],
            version: mutation.version,
          },
          idempotency: { command: idempotency, result: mutation },
        });

        return result.ok(mutation);
      });
    } catch (error) {
      if (isProductionFeatureFailure(error)) return result.err(error);
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'machine_assignment_failed',
          message: 'Machines could not be assigned to the stage.',
          safeMessage: 'Machines could not be assigned to the stage.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };
