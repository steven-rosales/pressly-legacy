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
  AdvanceProductionStage,
  AdvanceProductionStageRepository,
} from './advance-production-stage.port.ts';
export type { AdvanceProductionStage } from './advance-production-stage.port.ts';

export const makeAdvanceProductionStage =
  (deps: {
    repo: AdvanceProductionStageRepository;
    policy: ProductionPolicyPort;
    clock: ClockPort;
  }): AdvanceProductionStage =>
  async (command) => {
    try {
      return await deps.repo.transaction(async (repo) => {
        const eventType =
          command.transition === 'start' ? 'stage_started' : 'stage_completed';
        const idempotency = defineWorkEventCommand({
          operation: eventType,
          locationId: command.locationId,
          actorId: command.actorId,
          entityType: 'stage_run',
          entityId: command.stageRunId,
          expectedVersion: command.expectedVersion,
          payload: { transition: command.transition },
        });
        const replay = resolveWorkEventReplay<ProductionMutationResult>(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (replay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replay.tag === 'replay') return result.ok(replay.result);

        const now = deps.clock.now();
        const context = await repo.loadStageTransitionContext(
          command.locationId,
          command.stageRunId,
          now,
        );
        if (context === null)
          return result.err(
            productionError(
              'STAGE_RUN_NOT_FOUND',
              'The production stage was not found.',
              404,
            ),
          );
        if (context.stage.version !== command.expectedVersion)
          return result.err(
            productionError(
              'STAGE_RUN_VERSION_CONFLICT',
              'The production stage changed before the command.',
            ),
          );

        const assigned = context.machines.filter((machine) =>
          context.stage.machineIds.includes(machine.id),
        );
        const decision = deps.policy.evaluateStageTransition(
          {
            state: context.stage.status,
            plannedStartAt: new Date(context.stage.plannedStartAt),
            plannedEndAt: new Date(context.stage.plannedEndAt),
            actualStartAt:
              context.stage.actualStartAt === null
                ? null
                : new Date(context.stage.actualStartAt),
          },
          { type: command.transition },
          {
            now,
            productionRunStarted: context.productionRunStarted,
            previousStageCompleted: context.previousStageCompleted,
            sameKindAlreadyActive: context.sameKindAlreadyActive,
            machinesRequired: ['washing', 'drying'].includes(
              context.stage.stage,
            ),
            assignedMachineIds: assigned.map((machine) => machine.id),
            overlappingMachineIds: assigned
              .filter((machine) => machine.overlaps)
              .map((machine) => machine.id),
          },
        );
        if (decision.tag === 'err')
          return result.err(
            productionError(decision.error.code, decision.error.message, 409),
          );

        if (decision.value.state === 'planned')
          return result.err(
            productionError(
              'STAGE_POLICY_INVALID_RESULT',
              'The production stage policy returned an invalid transition.',
              500,
            ),
          );

        const mutation = await repo.transitionStage({
          locationId: command.locationId,
          stageRunId: command.stageRunId,
          expectedVersion: command.expectedVersion,
          nextState: decision.value.state,
          actorId: command.actorId,
          now,
        });
        if (mutation === null)
          return result.err(
            productionError(
              'STAGE_RUN_VERSION_CONFLICT',
              'The production stage changed before the command.',
            ),
          );

        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType,
          entityType: 'stage_run',
          entityId: command.stageRunId,
          actorId: command.actorId,
          expectedVersion: command.expectedVersion,
          idempotencyKey: command.idempotencyKey,
          payload: { version: mutation.version },
          idempotency: { command: idempotency, result: mutation },
        });

        return result.ok(mutation);
      });
    } catch (error) {
      return result.err(
        productionError(
          'STAGE_TRANSITION_FAILED',
          'The production stage could not be advanced.',
          500,
          error,
        ),
      );
    }
  };
