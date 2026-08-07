import {
  conflictFailure,
  notFoundFailure,
  isProductionFeatureFailure,
} from '../../../foundations/language/failures/production-failure.factory.ts';
import {
  databaseError,
  invariantViolationError,
} from '@pressly/errors/factories';
import { mapUnknownError } from '@pressly/errors/app-error';
import { result } from '@pressly/kernel';
import { productionIdempotencyConflict } from '../../../foundations/language/commands/production-command.failure.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../../../foundations/language/commands/production-idempotency.policy.ts';
import type { Clock } from '@pressly/time';
import type {
  ProductionBatchLifecycleDecision,
  ProductionOrderStageAttemptMutation,
  ProductionOrderTerminalExecutionMutation,
  ProductionStageCompletionTiming,
  ProductionStageStartTiming,
  ProductionTerminalLifecycleDecisions,
} from '../../../foundations/language/execution/production-lifecycle.model.ts';
import type { ProductionRules } from '../../../foundations/language/rules/production-rules.model.ts';
import type { ProductionSignalsPort } from '../../../foundations/ports/signals/production-signals.port.ts';
import type {
  AdvanceProductionStageCommand,
  AdvanceProductionStageResult,
} from './advance-production-stage.model.ts';
import type {
  AdvanceProductionStage,
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

type AdvanceProductionStagePolicy = Pick<
  ProductionRules,
  | 'evaluateProductionOrderOperationalAccess'
  | 'evaluateStageTransition'
  | 'evaluateMachineAssignment'
  | 'evaluateProductionBatchTransition'
  | 'evaluateProductionOrderStageAttemptTransition'
  | 'resolveProductionOrderExecutionState'
  | 'evaluateProductionOrderExecutionTransition'
  | 'evaluateProductionRunTransition'
  | 'evaluateProductionShiftTransition'
>;

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
  policy: AdvanceProductionStagePolicy;
  clock: Clock;
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
            notFoundFailure({
              code: 'stage_run_not_found',
              message: 'The production stage was not found.',
              safeMessage: 'The production stage was not found.',
            }),
          );
        if (context.stage.version !== command.expectedVersion)
          return result.err(
            conflictFailure({
              code: 'stage_run_version_conflict',
              message: 'The production stage changed before the command.',
              safeMessage: 'The production stage changed before the command.',
            }),
          );
        for (const order of context.activeOrders) {
          const access = deps.policy.evaluateProductionOrderOperationalAccess({
            resolutionState: order.resolutionState,
          });
          if (access.tag === 'err')
            return result.err(
              conflictFailure({
                code: access.error.code.toLowerCase(),
                message: access.error.message,
                safeMessage: access.error.message,
              }),
            );
        }

        const assigned = context.machines.filter((machine) =>
          context.stage.machineIds.includes(machine.id),
        );
        const machinesRequired = ['washing', 'drying'].includes(
          context.stage.stage,
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
            machinesRequired,
            assignedMachineIds: assigned.map((machine) => machine.id),
            overlappingMachineIds: assigned
              .filter((machine) => machine.overlaps)
              .map((machine) => machine.id),
          },
        );
        if (decision.tag === 'err')
          return result.err(
            conflictFailure({
              code: decision.error.code.toLowerCase(),
              message: decision.error.message,
              safeMessage: decision.error.message,
            }),
          );
        if (command.transition === 'start' && machinesRequired) {
          const assignment = deps.policy.evaluateMachineAssignment({
            stageKind: context.stage.stage,
            batchWeightLbs: context.batchWeightLbs,
            machines: assigned,
          });
          if (assignment.tag === 'err')
            return result.err(
              conflictFailure({
                code: assignment.error.code.toLowerCase(),
                message: assignment.error.message,
                safeMessage: assignment.error.message,
              }),
            );
        }
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
                conflictFailure({
                  code: 'stage_start_confirmation_stale',
                  message: 'The early-start confirmation is no longer current.',
                  safeMessage:
                    'The early-start confirmation is no longer current.',
                }),
              );

            if (context.stage.status !== 'planned')
              throw invariantViolationError({
                code: 'stage_policy_invalid_result',
                message:
                  'The production stage policy returned an invalid transition.',
                safeMessage:
                  'The production stage policy returned an invalid transition.',
              });
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
                conflictFailure({
                  code: 'stage_completion_confirmation_stale',
                  message:
                    'The early-completion confirmation is no longer current.',
                  safeMessage:
                    'The early-completion confirmation is no longer current.',
                }),
              );

            if (context.stage.status !== 'started')
              throw invariantViolationError({
                code: 'stage_policy_invalid_result',
                message:
                  'The production stage policy returned an invalid transition.',
                safeMessage:
                  'The production stage policy returned an invalid transition.',
              });
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
            throw invariantViolationError({
              code: 'stage_policy_invalid_result',
              message:
                'The production stage policy returned an invalid confirmation.',
              safeMessage:
                'The production stage policy returned an invalid confirmation.',
            });
        } else {
          if (
            decision.value.from === 'completed' ||
            decision.value.state === 'planned'
          )
            throw invariantViolationError({
              code: 'stage_policy_invalid_result',
              message:
                'The production stage policy returned an invalid transition.',
              safeMessage:
                'The production stage policy returned an invalid transition.',
            });
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
              conflictFailure({
                code: batchDecision.error.code.toLowerCase(),
                message: batchDecision.error.message,
                safeMessage: batchDecision.error.message,
              }),
            );
          batchLifecycle = batchDecision.value;
        } else if (context.batch.status !== context.stage.stage)
          throw invariantViolationError({
            code: 'production_batch_state_inconsistent',
            message:
              'The production batch state does not match its active stage.',
            safeMessage:
              'The production batch state does not match its active stage.',
          });

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
                conflictFailure({
                  code: attemptDecision.error.code.toLowerCase(),
                  message: attemptDecision.error.message,
                  safeMessage: attemptDecision.error.message,
                }),
              );
            attemptLifecycles.push({
              attemptId: attempt.id,
              stageRunId: context.stage.id,
              lifecycle: attemptDecision.value,
            });
          }
          if (attemptLifecycles.length === 0)
            return result.err(
              conflictFailure({
                code: 'production_stage_attempts_missing',
                message: 'The production stage has no assigned order attempts.',
                safeMessage:
                  'The production stage has no assigned order attempts.',
              }),
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
                conflictFailure({
                  code: resolved.error.code.toLowerCase(),
                  message: resolved.error.message,
                  safeMessage: resolved.error.message,
                }),
              );
            const orderDecision =
              deps.policy.evaluateProductionOrderExecutionTransition({
                state: resolved.value,
                event: 'finish_with_batch',
              });
            if (orderDecision.tag === 'err')
              return result.err(
                conflictFailure({
                  code: orderDecision.error.code.toLowerCase(),
                  message: orderDecision.error.message,
                  safeMessage: orderDecision.error.message,
                }),
              );
            if (
              orderDecision.value.from !== 'scheduled' ||
              orderDecision.value.state !== 'finished'
            )
              return result.err(
                conflictFailure({
                  code: 'production_order_execution_transition_invalid',
                  message:
                    'The production order cannot be finished with this batch.',
                  safeMessage:
                    'The production order cannot be finished with this batch.',
                }),
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
              conflictFailure({
                code: 'production_batch_orders_missing',
                message: 'The production batch has no active orders.',
                safeMessage: 'The production batch has no active orders.',
              }),
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
              conflictFailure({
                code: 'production_run_transition_invalid',
                message: 'The production run cannot be completed.',
                safeMessage: 'The production run cannot be completed.',
              }),
            );
          if (
            shiftLifecycle.tag === 'err' ||
            shiftLifecycle.value.from !== 'open' ||
            shiftLifecycle.value.state !== 'closed'
          )
            return result.err(
              conflictFailure({
                code: 'production_shift_transition_invalid',
                message: 'The production shift cannot be closed.',
                safeMessage: 'The production shift cannot be closed.',
              }),
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
            conflictFailure({
              code: 'stage_run_version_conflict',
              message: 'The production stage changed before the command.',
              safeMessage: 'The production stage changed before the command.',
            }),
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
      if (isProductionFeatureFailure(error)) return result.err(error);
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'stage_transition_failed',
          message: 'The production stage could not be advanced.',
          safeMessage: 'The production stage could not be advanced.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };

  return advance as AdvanceProductionStage;
};
