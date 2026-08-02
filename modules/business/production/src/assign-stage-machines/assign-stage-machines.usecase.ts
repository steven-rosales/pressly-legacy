import {
  conflictError,
  databaseError,
  mapUnknownError,
  notFoundError,
} from '@pressly/errors';
import { result } from '@pressly/kernel';
import type { ProductionMutationResult } from '@pressly/contracts';
import { productionIdempotencyConflict } from '../command-execution/production-command.error.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../command-execution/production-idempotency.policy.ts';
import type { ClockPort } from '../command-execution/production-command.port.ts';
import type { ProductionPolicyPort } from '../production-policy/production-policy.port.ts';
import type {
  AssignStageMachines,
  AssignStageMachinesRepository,
} from './assign-stage-machines.port.ts';
export type { AssignStageMachines } from './assign-stage-machines.port.ts';

export const makeAssignStageMachines =
  (deps: {
    repo: AssignStageMachinesRepository;
    policy: Pick<ProductionPolicyPort, 'evaluateMachineAssignment'>;
    clock: ClockPort;
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
            notFoundError({
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
            conflictError({
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
            notFoundError({
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
            conflictError({
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
            conflictError({
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
      return result.err(
        mapUnknownError(error, (unknownCause) =>
          databaseError({
            code: 'machine_assignment_failed',
            message: 'Machines could not be assigned to the stage.',
            safeMessage: 'Machines could not be assigned to the stage.',
            status: 503,
            cause: unknownCause,
          }),
        ),
      );
    }
  };
