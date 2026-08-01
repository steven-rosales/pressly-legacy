import { result } from '@pressly/kernel';
import type {
  AdvanceProductionStageResult,
  ProductionStageCompletionTiming,
  ProductionStageStartTiming,
} from '@pressly/contracts';
import {
  productionError,
  productionIdempotencyConflict,
} from '../failure-mapping/production.error.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../command-execution/production-idempotency.policy.ts';
import type { ClockPort } from '../command-execution/production-command.port.ts';
import type {
  ProductionBatchLifecycleDecision,
  ProductionOrderStageAttemptMutation,
  ProductionOrderTerminalExecutionMutation,
  ProductionTerminalLifecycleDecisions,
} from '../production-lifecycle/production-lifecycle.port.ts';
import type { ProductionPolicyPort } from '../production-policy/production-policy.port.ts';
import type { ProductionSignalsPort } from '../production-signals/production-signals.port.ts';
import type {
  AdvanceProductionStage,
  AdvanceProductionStageCommand,
  AdvanceProductionStageRepository,
} from './advance-production-stage.port.ts';
import {
  makeStageCompletionConfirmationRequired,
  matchesStageCompletionConfirmation,
} from './stage-completion-confirmation.policy.ts';
import {
  makeStageStartConfirmationRequired,
  matchesStageStartConfirmation,
} from './stage-start-confirmation.policy.ts';
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

type EarlyStartAudit = Readonly<{
  actorId: string;
  confirmationHash: string;
  confirmationObservedAt: string;
  confirmedAt: string;
  plannedStartAt: string;
  plannedEndAt: string;
  remainingMilliseconds: number;
}>;

const batchEventForStage = (input: {
  stage: 'sorting' | 'washing' | 'drying' | 'folding_packaging';
  nextState: 'started' | 'completed';
}):
  | 'start_sorting'
  | 'start_washing'
  | 'start_drying'
  | 'start_folding_packaging'
  | 'finish'
  | null => {
  if (input.nextState === 'completed')
    return input.stage === 'folding_packaging' ? 'finish' : null;
  if (input.stage === 'sorting') return 'start_sorting';
  if (input.stage === 'washing') return 'start_washing';
  if (input.stage === 'drying') return 'start_drying';
  return 'start_folding_packaging';
};

const earlyStartAudit = (input: {
  actorId: string;
  confirmation: Readonly<{
    observedAt: string;
    confirmationHash: string;
  }>;
  timing: ProductionStageStartTiming;
  now: Date;
}): EarlyStartAudit => ({
  actorId: input.actorId,
  confirmationHash: input.confirmation.confirmationHash,
  confirmationObservedAt: input.confirmation.observedAt,
  confirmedAt: input.now.toISOString(),
  plannedStartAt: input.timing.plannedStartAt,
  plannedEndAt: input.timing.plannedEndAt,
  remainingMilliseconds: input.timing.remainingMilliseconds,
});

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
            ...(command.transition === 'complete' ||
            command.confirmation !== undefined
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
        const replayAfterLock =
          resolveWorkEventReplay<AdvanceProductionStageResult>(
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
        for (const order of context.activeOrders) {
          const access = deps.policy.evaluateProductionOrderOperationalAccess({
            resolutionState: order.resolutionState,
          });
          if (access.tag === 'err')
            return result.err(
              productionError(access.error.code, access.error.message, 409),
            );
        }

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

        let stageLifecycle: Readonly<{
          from: 'planned' | 'started';
          state: 'started' | 'completed';
        }>;
        let startAudit: EarlyStartAudit | null = null;
        let completionAudit: EarlyCompletionAudit | null = null;
        if (decision.value.status === 'confirmation_required') {
          if (
            decision.value.action === 'start' &&
            command.transition === 'start'
          ) {
            const confirmationRequired = makeStageStartConfirmationRequired({
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
              !matchesStageStartConfirmation({
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
                  'STAGE_START_CONFIRMATION_STALE',
                  'The early-start confirmation is no longer current.',
                ),
              );

            if (context.stage.status !== 'planned')
              return result.err(
                productionError(
                  'STAGE_POLICY_INVALID_RESULT',
                  'The production stage policy returned an invalid transition.',
                  500,
                ),
              );
            stageLifecycle = {
              from: context.stage.status,
              state: 'started',
            };
            startAudit = earlyStartAudit({
              actorId: command.actorId,
              confirmation: command.confirmation,
              timing: decision.value.timing,
              now,
            });
          } else if (
            decision.value.action === 'complete' &&
            command.transition === 'complete'
          ) {
            const confirmationRequired =
              makeStageCompletionConfirmationRequired({
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

            if (context.stage.status !== 'started')
              return result.err(
                productionError(
                  'STAGE_POLICY_INVALID_RESULT',
                  'The production stage policy returned an invalid transition.',
                  500,
                ),
              );
            stageLifecycle = {
              from: context.stage.status,
              state: 'completed',
            };
            completionAudit = earlyCompletionAudit({
              actorId: command.actorId,
              confirmation: command.confirmation,
              timing: decision.value.timing,
              now,
            });
          } else
            return result.err(
              productionError(
                'STAGE_POLICY_INVALID_RESULT',
                'The production stage policy returned an invalid confirmation.',
                500,
              ),
            );
        } else {
          if (
            decision.value.from === 'completed' ||
            decision.value.state === 'planned'
          )
            return result.err(
              productionError(
                'STAGE_POLICY_INVALID_RESULT',
                'The production stage policy returned an invalid transition.',
                500,
              ),
            );
          stageLifecycle = {
            from: decision.value.from,
            state: decision.value.state,
          };
        }

        implicitlyFrozeMembership =
          command.transition === 'start' &&
          context.stage.stage === 'sorting' &&
          !context.batchMembershipFrozen;

        const batchEvent = batchEventForStage({
          stage: context.stage.stage,
          nextState: stageLifecycle.state,
        });
        let batchLifecycle: ProductionBatchLifecycleDecision | null = null;
        if (batchEvent !== null) {
          const batchDecision = deps.policy.evaluateProductionBatchTransition({
            state: context.batch.status,
            event: batchEvent,
          });
          if (batchDecision.tag === 'err')
            return result.err(
              productionError(
                batchDecision.error.code,
                batchDecision.error.message,
                409,
              ),
            );
          batchLifecycle = batchDecision.value;
        } else if (context.batch.status !== context.stage.stage)
          return result.err(
            productionError(
              'PRODUCTION_BATCH_STATE_INCONSISTENT',
              'The production batch state does not match its active stage.',
              409,
            ),
          );

        const attemptLifecycles: ProductionOrderStageAttemptMutation[] = [];
        if (stageLifecycle.state === 'completed') {
          for (const attempt of context.attempts) {
            if (attempt.status !== 'assigned') continue;
            const attemptDecision =
              deps.policy.evaluateProductionOrderStageAttemptTransition({
                state: attempt.status,
                event: 'complete_with_stage',
              });
            if (attemptDecision.tag === 'err')
              return result.err(
                productionError(
                  attemptDecision.error.code,
                  attemptDecision.error.message,
                  409,
                ),
              );
            attemptLifecycles.push({
              attemptId: attempt.id,
              stageRunId: context.stage.id,
              lifecycle: attemptDecision.value,
            });
          }
          if (attemptLifecycles.length === 0)
            return result.err(
              productionError(
                'PRODUCTION_STAGE_ATTEMPTS_MISSING',
                'The production stage has no assigned order attempts.',
                409,
              ),
            );
        }

        let terminalLifecycle: ProductionTerminalLifecycleDecisions | null =
          null;
        if (
          stageLifecycle.state === 'completed' &&
          context.stage.stage === 'folding_packaging'
        ) {
          const orderLifecycles: ProductionOrderTerminalExecutionMutation[] =
            [];
          for (const order of context.activeOrders) {
            const resolved = deps.policy.resolveProductionOrderExecutionState({
              executionState: order.executionStatus,
              operationalStatus: order.status,
            });
            if (resolved.tag === 'err')
              return result.err(
                productionError(
                  resolved.error.code,
                  resolved.error.message,
                  409,
                ),
              );
            const orderDecision =
              deps.policy.evaluateProductionOrderExecutionTransition({
                state: resolved.value,
                event: 'finish_with_batch',
              });
            if (orderDecision.tag === 'err')
              return result.err(
                productionError(
                  orderDecision.error.code,
                  orderDecision.error.message,
                  409,
                ),
              );
            if (
              orderDecision.value.from !== 'scheduled' ||
              orderDecision.value.state !== 'finished'
            )
              return result.err(
                productionError(
                  'PRODUCTION_ORDER_EXECUTION_TRANSITION_INVALID',
                  'The production order cannot be finished with this batch.',
                  409,
                ),
              );
            orderLifecycles.push({
              productionOrderId: order.id,
              persistedState:
                order.executionStatus === 'unassigned' ||
                order.executionStatus === 'scheduled' ||
                order.executionStatus === 'finished'
                  ? order.executionStatus
                  : resolved.value,
              expectedVersion: order.version,
              lifecycle: {
                from: orderDecision.value.from,
                state: orderDecision.value.state,
              },
            });
          }
          if (orderLifecycles.length === 0)
            return result.err(
              productionError(
                'PRODUCTION_BATCH_ORDERS_MISSING',
                'The production batch has no active orders.',
                409,
              ),
            );
          const runLifecycle = deps.policy.evaluateProductionRunTransition({
            state: context.productionRunStatus,
            event: 'complete_final_batch',
          });
          const shiftLifecycle = deps.policy.evaluateProductionShiftTransition({
            state: context.productionShiftStatus,
            event: 'close_after_execution',
          });
          if (
            runLifecycle.tag === 'err' ||
            runLifecycle.value.from !== 'started' ||
            runLifecycle.value.state !== 'completed'
          )
            return result.err(
              productionError(
                'PRODUCTION_RUN_TRANSITION_INVALID',
                'The production run cannot be completed.',
                409,
              ),
            );
          if (
            shiftLifecycle.tag === 'err' ||
            shiftLifecycle.value.from !== 'open' ||
            shiftLifecycle.value.state !== 'closed'
          )
            return result.err(
              productionError(
                'PRODUCTION_SHIFT_TRANSITION_INVALID',
                'The production shift cannot be closed.',
                409,
              ),
            );
          terminalLifecycle = {
            run: runLifecycle.value,
            shift: shiftLifecycle.value,
            orders: orderLifecycles,
          };
        }

        const mutation = await repo.transitionStage({
          locationId: command.locationId,
          stageRunId: command.stageRunId,
          expectedVersion: command.expectedVersion,
          stageLifecycle,
          batchId: context.batch.id,
          batchExpectedVersion: context.batch.version,
          batchState: context.batch.status,
          batchLifecycle,
          freezeMembership: implicitlyFrozeMembership,
          attemptLifecycles,
          terminalLifecycle,
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
            ...(startAudit === null ? {} : { earlyStart: startAudit }),
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
