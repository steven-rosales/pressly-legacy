import { result } from '@pressly/kernel';
import type {
  AdvanceProductionStageResult,
  ProductionStageCompletionTiming,
} from '@pressly/contracts';
import {
  productionError,
  productionIdempotencyConflict,
} from '../production.error.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../production-idempotency.policy.ts';
import type {
  ClockPort,
  ProductionPolicyPort,
  ProductionSignalsPort,
} from '../production.port.ts';
import type {
  AdvanceProductionStage,
  AdvanceProductionStageCommand,
  AdvanceProductionStageRepository,
} from './advance-production-stage.port.ts';
import {
  makeStageCompletionConfirmationRequired,
  matchesStageCompletionConfirmation,
} from './stage-completion-confirmation.policy.ts';
export type { AdvanceProductionStage } from './advance-production-stage.port.ts';

type EarlyCompletionAudit = Readonly<{
  actorId: string;
  confirmationHash: string;
  confirmationObservedAt: string;
  confirmedAt: string;
  actualStartAt: string;
  plannedEndAt: string;
  completionBoundaryAt: string;
  plannedDurationMilliseconds: number;
  elapsedMilliseconds: number;
  remainingMilliseconds: number;
}>;

const earlyCompletionAudit = (input: {
  actorId: string;
  confirmation: Readonly<{
    observedAt: string;
    confirmationHash: string;
  }>;
  timing: ProductionStageCompletionTiming;
  now: Date;
}): EarlyCompletionAudit => ({
  actorId: input.actorId,
  confirmationHash: input.confirmation.confirmationHash,
  confirmationObservedAt: input.confirmation.observedAt,
  confirmedAt: input.now.toISOString(),
  actualStartAt: input.timing.actualStartAt,
  plannedEndAt: input.timing.plannedEndAt,
  completionBoundaryAt: input.timing.completionBoundaryAt,
  plannedDurationMilliseconds: input.timing.plannedDurationMilliseconds,
  elapsedMilliseconds: input.timing.elapsedMilliseconds,
  remainingMilliseconds: input.timing.remainingMilliseconds,
});

export const makeAdvanceProductionStage = (deps: {
  repo: AdvanceProductionStageRepository;
  policy: ProductionPolicyPort;
  clock: ClockPort;
  signals?: ProductionSignalsPort;
}): AdvanceProductionStage => {
  const advance = async (command: AdvanceProductionStageCommand) => {
    let implicitlyFrozeMembership = false;
    try {
      const outcome = await deps.repo.transaction(async (repo) => {
        const eventType =
          command.transition === 'start' ? 'stage_started' : 'stage_completed';
        const idempotency = defineWorkEventCommand({
          operation: eventType,
          locationId: command.locationId,
          actorId: command.actorId,
          entityType: 'stage_run',
          entityId: command.stageRunId,
          expectedVersion: command.expectedVersion,
          payload: {
            transition: command.transition,
            ...(command.transition === 'complete'
              ? { confirmation: command.confirmation ?? null }
              : {}),
          },
        });
        const replay = resolveWorkEventReplay<AdvanceProductionStageResult>(
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

        let nextState: 'started' | 'completed';
        let completionAudit: EarlyCompletionAudit | null = null;
        if (decision.value.status === 'confirmation_required') {
          if (command.transition !== 'complete')
            return result.err(
              productionError(
                'STAGE_POLICY_INVALID_RESULT',
                'The production stage policy returned an invalid confirmation.',
                500,
              ),
            );

          const confirmationRequired = makeStageCompletionConfirmationRequired({
            locationId: command.locationId,
            stageRunId: command.stageRunId,
            actorId: command.actorId,
            expectedVersion: command.expectedVersion,
            code: decision.value.code,
            message: decision.value.message,
            timing: decision.value.timing,
          });
          if (command.confirmation === undefined)
            return result.ok(confirmationRequired);

          if (
            !matchesStageCompletionConfirmation({
              locationId: command.locationId,
              stageRunId: command.stageRunId,
              actorId: command.actorId,
              expectedVersion: command.expectedVersion,
              timing: decision.value.timing,
              now,
              confirmation: command.confirmation,
            })
          )
            return result.err(
              productionError(
                'STAGE_COMPLETION_CONFIRMATION_STALE',
                'The early-completion confirmation is no longer current.',
              ),
            );

          nextState = 'completed';
          completionAudit = earlyCompletionAudit({
            actorId: command.actorId,
            confirmation: command.confirmation,
            timing: decision.value.timing,
            now,
          });
        } else {
          if (decision.value.state === 'planned')
            return result.err(
              productionError(
                'STAGE_POLICY_INVALID_RESULT',
                'The production stage policy returned an invalid transition.',
                500,
              ),
            );
          nextState = decision.value.state;
        }

        implicitlyFrozeMembership =
          command.transition === 'start' &&
          context.stage.stage === 'sorting' &&
          !context.batchMembershipFrozen;

        const mutation = await repo.transitionStage({
          locationId: command.locationId,
          stageRunId: command.stageRunId,
          expectedVersion: command.expectedVersion,
          nextState,
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
          payload: {
            version: mutation.version,
            ...(completionAudit === null
              ? {}
              : { earlyCompletion: completionAudit }),
          },
          idempotency: { command: idempotency, result: mutation },
        });

        return result.ok(mutation);
      });
      if (
        outcome.tag === 'ok' &&
        !outcome.value.replayed &&
        implicitlyFrozeMembership
      )
        deps.signals?.batchFrozen({ source: 'stage_start' });
      return outcome;
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

  return advance as AdvanceProductionStage;
};
