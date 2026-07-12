import { result } from '@pressly/kernel';
import type { ProductionMutationResult } from '@pressly/contracts';
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
  AssignStageMachines,
  AssignStageMachinesRepository,
} from './assign-stage-machines.port.ts';
export type { AssignStageMachines } from './assign-stage-machines.port.ts';

export const makeAssignStageMachines =
  (deps: {
    repo: AssignStageMachinesRepository;
    policy: ProductionPolicyPort;
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
            productionError(
              'STAGE_RUN_NOT_FOUND',
              'The production stage was not found.',
              404,
            ),
          );
        if (
          context.stage.status !== 'planned' ||
          context.stage.version !== command.expectedVersion
        )
          return result.err(
            productionError(
              'STAGE_RUN_VERSION_CONFLICT',
              'The production stage changed before assignment.',
            ),
          );

        const machines = context.machines.filter((machine) =>
          command.machineIds.includes(machine.id),
        );
        if (machines.length !== command.machineIds.length)
          return result.err(
            productionError(
              'MACHINE_NOT_FOUND',
              'One or more requested machines are not available.',
              404,
            ),
          );

        const decision = deps.policy.evaluateMachineAssignment({
          stageKind: context.stage.stage,
          batchWeightLbs: context.batchWeightLbs,
          machines,
        });
        if (decision.tag === 'err')
          return result.err(
            productionError(decision.error.code, decision.error.message, 409),
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
            productionError(
              'STAGE_RUN_VERSION_CONFLICT',
              'The production stage changed before assignment.',
            ),
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
        productionError(
          'MACHINE_ASSIGNMENT_FAILED',
          'Machines could not be assigned to the stage.',
          500,
          error,
        ),
      );
    }
  };
