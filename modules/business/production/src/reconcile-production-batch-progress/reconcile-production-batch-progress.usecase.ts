import {
  conflictError,
  databaseError,
  invariantViolationError,
  mapUnknownError,
  notFoundError,
} from '@pressly/errors';
import { result } from '@pressly/kernel';
import type {
  ProductionBatchProgressReconciliationResult,
  ProductionFloorProgressTarget,
} from '@pressly/contracts';
import { productionIdempotencyConflict } from '../command-execution/production-command.error.ts';
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
} from '../production-lifecycle/production-lifecycle.model.ts';
import type { ProductionPolicyPort } from '../production-policy/production-policy.port.ts';
import type { ProductionSignalsPort } from '../production-signals/production-signals.port.ts';
import {
  makeProgressReconciliationConfirmationRequired,
  matchesProgressReconciliationConfirmation,
} from './progress-reconciliation-confirmation.policy.ts';
import type {
  ReconcileProductionBatchProgress,
  ReconcileProductionBatchProgressRepository,
  ReconciliationProjection,
  ReconciliationStage,
} from './reconcile-production-batch-progress.port.ts';
export type { ReconcileProductionBatchProgress } from './reconcile-production-batch-progress.port.ts';

type ReconcileProductionBatchProgressPolicy = Pick<
  ProductionPolicyPort,
  | 'evaluateProductionOrderOperationalAccess'
  | 'evaluateMachineAssignment'
  | 'evaluateFloorProgressReconciliation'
  | 'evaluateStageTransition'
  | 'evaluateProductionOrderStageAttemptTransition'
  | 'evaluateProductionBatchTransition'
  | 'resolveProductionOrderExecutionState'
  | 'evaluateProductionOrderExecutionTransition'
  | 'evaluateProductionRunTransition'
  | 'evaluateProductionShiftTransition'
>;

const activeStageForTarget = (
  target: ProductionFloorProgressTarget,
): ReconciliationStage['stage'] | null => {
  if (target === 'sorting_started') return 'sorting';
  if (target === 'washing_started') return 'washing';
  if (target === 'drying_started') return 'drying';
  if (target === 'folding_packaging_started') return 'folding_packaging';
  return null;
};

const reconciliationBatchEvent = (
  state: ReconciliationProjection['batchStatus'],
):
  | 'reconcile_to_sorting'
  | 'reconcile_to_washing'
  | 'reconcile_to_drying'
  | 'reconcile_to_folding_packaging'
  | 'reconcile_to_finished' => {
  if (state === 'sorting') return 'reconcile_to_sorting';
  if (state === 'washing') return 'reconcile_to_washing';
  if (state === 'drying') return 'reconcile_to_drying';
  if (state === 'folding_packaging') return 'reconcile_to_folding_packaging';
  return 'reconcile_to_finished';
};

const exactStageVersionsMatch = (
  actual: readonly ReconciliationStage[],
  expected: readonly Readonly<{ stageRunId: string; version: number }>[],
): boolean => {
  const expectedById = new Map(
    expected.map((stage) => [stage.stageRunId, stage.version]),
  );
  return (
    expectedById.size === actual.length &&
    actual.every(
      (stage) => expectedById.get(stage.stageRunId) === stage.version,
    )
  );
};

export const makeReconcileProductionBatchProgress =
  (deps: {
    repo: ReconcileProductionBatchProgressRepository;
    policy: ReconcileProductionBatchProgressPolicy;
    clock: ClockPort;
    signals?: ProductionSignalsPort;
  }): ReconcileProductionBatchProgress =>
  async (command) => {
    try {
      const outcome = await deps.repo.transaction(async (repo) => {
        const idempotency = defineWorkEventCommand({
          operation: 'batch_progress_reconciled',
          locationId: command.locationId,
          actorId: command.actorId,
          entityType: 'production_batch',
          entityId: command.productionBatchId,
          expectedVersion: command.expectedBatchVersion,
          payload: {
            productionRunId: command.productionRunId,
            expectedQueueVersion: command.expectedQueueVersion,
            expectedStageVersions: command.expectedStageVersions,
            target: command.target,
            reason: command.reason,
            note: command.note ?? null,
            machineIds: [...command.machineIds].sort(),
            confirmation: command.confirmation ?? null,
          },
        });
        const replay =
          resolveWorkEventReplay<ProductionBatchProgressReconciliationResult>(
            await repo.findWorkEvent(command.idempotencyKey),
            idempotency,
          );
        if (replay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replay.tag === 'replay') return result.ok(replay.result);

        const context = await repo.loadContext(
          command.locationId,
          command.productionRunId,
          command.productionBatchId,
        );
        const replayAfterLock =
          resolveWorkEventReplay<ProductionBatchProgressReconciliationResult>(
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
        if (context.run.queueVersion !== command.expectedQueueVersion)
          return result.err(
            conflictError({
              code: 'production_queue_version_conflict',
              message:
                'The production queue changed before floor progress was recorded.',
              safeMessage:
                'The production queue changed before floor progress was recorded.',
            }),
          );
        if (context.batch.version !== command.expectedBatchVersion)
          return result.err(
            conflictError({
              code: 'production_batch_version_conflict',
              message:
                'The production batch changed before floor progress was recorded.',
              safeMessage:
                'The production batch changed before floor progress was recorded.',
            }),
          );
        if (
          !exactStageVersionsMatch(
            context.stages,
            command.expectedStageVersions,
          )
        )
          return result.err(
            conflictError({
              code: 'stage_run_version_conflict',
              message:
                'A production stage changed before floor progress was recorded.',
              safeMessage:
                'A production stage changed before floor progress was recorded.',
            }),
          );
        for (const order of context.activeOrders) {
          const access = deps.policy.evaluateProductionOrderOperationalAccess({
            resolutionState: order.resolutionState,
          });
          if (access.tag === 'err')
            return result.err(
              conflictError({
                code: access.error.code.toLowerCase(),
                message: access.error.message,
                safeMessage: access.error.message,
              }),
            );
        }

        const activeStage = activeStageForTarget(command.target);
        const selectedMachines = context.machines.filter((machine) =>
          command.machineIds.includes(machine.id),
        );
        if (selectedMachines.length !== command.machineIds.length)
          return result.err(
            notFoundError({
              code: 'machine_not_found',
              message: 'One or more requested machines are not available.',
              safeMessage: 'One or more requested machines are not available.',
            }),
          );

        let machineIds: readonly string[] = [];
        if (activeStage === 'washing' || activeStage === 'drying') {
          const machineDecision = deps.policy.evaluateMachineAssignment({
            stageKind: activeStage,
            batchWeightLbs: context.batch.derivedWeightLbs,
            machines: selectedMachines,
          });
          if (machineDecision.tag === 'err')
            return result.err(
              conflictError({
                code: machineDecision.error.code.toLowerCase(),
                message: machineDecision.error.message,
                safeMessage: machineDecision.error.message,
              }),
            );
          machineIds = machineDecision.value.machineIds;
        }

        const decision = deps.policy.evaluateFloorProgressReconciliation({
          runStatus: context.run.status,
          batchStatus: context.batch.status,
          stages: context.stages.map((stage) => ({
            stageRunId: stage.stageRunId,
            stage: stage.stage,
            status: stage.status,
          })),
          target: command.target,
          sameKindAlreadyActive:
            activeStage !== null &&
            context.activeStageKinds.includes(activeStage),
          assignedMachineIds: machineIds,
          overlappingMachineIds: selectedMachines
            .filter((machine) => machine.overlaps)
            .map((machine) => machine.id),
        });
        if (decision.tag === 'err')
          return result.err(
            conflictError({
              code: decision.error.code.toLowerCase(),
              message: decision.error.message,
              safeMessage: decision.error.message,
            }),
          );
        const projection = decision.value as ReconciliationProjection;
        const confirmationInput = {
          locationId: command.locationId,
          actorId: command.actorId,
          context,
          projection,
          reason: command.reason,
          note: command.note ?? null,
          machineIds,
        };
        const confirmationRequired =
          makeProgressReconciliationConfirmationRequired(confirmationInput);

        if (command.confirmation === undefined)
          return result.ok(confirmationRequired);
        if (
          !matchesProgressReconciliationConfirmation({
            ...confirmationInput,
            confirmation: command.confirmation,
          })
        )
          return result.err(
            conflictError({
              code: 'progress_reconciliation_confirmation_stale',
              message: 'The floor-progress confirmation is no longer current.',
              safeMessage:
                'The floor-progress confirmation is no longer current.',
            }),
          );

        const now = deps.clock.now();
        const stageLifecycles: {
          stageRunId: string;
          lifecycle: Readonly<{
            from: 'planned' | 'started';
            state: 'started' | 'completed';
          }>;
        }[] = [];
        const attemptLifecycles: ProductionOrderStageAttemptMutation[] = [];
        for (const transition of projection.stages) {
          if (transition.currentStatus === transition.nextStatus) continue;
          const current = context.stages.find(
            (stage) => stage.stageRunId === transition.stageRunId,
          );
          if (current === undefined)
            return result.err(
              invariantViolationError({
                code: 'batch_stage_graph_invalid',
                message: 'The production batch stage graph is incomplete.',
                safeMessage: 'The production batch stage graph is incomplete.',
              }),
            );
          const stageDecision = deps.policy.evaluateStageTransition(
            {
              state: transition.currentStatus,
              plannedStartAt: new Date(current.plannedStartAt),
              plannedEndAt: new Date(current.plannedEndAt),
              actualStartAt:
                current.actualStartAt === null
                  ? null
                  : new Date(current.actualStartAt),
            },
            {
              type:
                transition.nextStatus === 'started'
                  ? 'reconcile_start'
                  : 'reconcile_complete',
            },
            {
              now,
              productionRunStarted: context.run.status === 'started',
              previousStageCompleted: true,
              sameKindAlreadyActive: context.activeStageKinds.includes(
                transition.stage,
              ),
              machinesRequired:
                transition.stage === 'washing' || transition.stage === 'drying',
              assignedMachineIds:
                transition.nextStatus === 'started' ? machineIds : [],
              overlappingMachineIds: selectedMachines
                .filter((machine) => machine.overlaps)
                .map((machine) => machine.id),
            },
          );
          if (
            stageDecision.tag === 'err' ||
            stageDecision.value.status !== 'allowed' ||
            stageDecision.value.from === 'completed' ||
            stageDecision.value.state === 'planned'
          )
            return result.err(
              conflictError({
                code: (stageDecision.tag === 'err'
                  ? stageDecision.error.code
                  : 'STAGE_POLICY_INVALID_RESULT'
                ).toLowerCase(),
                message:
                  stageDecision.tag === 'err'
                    ? stageDecision.error.message
                    : 'The production stage policy returned an invalid reconciliation transition.',
                safeMessage:
                  stageDecision.tag === 'err'
                    ? stageDecision.error.message
                    : 'The production stage policy returned an invalid reconciliation transition.',
              }),
            );
          stageLifecycles.push({
            stageRunId: transition.stageRunId,
            lifecycle: {
              from: stageDecision.value.from,
              state: stageDecision.value.state,
            },
          });

          if (stageDecision.value.state !== 'completed') continue;
          const assignedAttempts = context.attempts.filter(
            (attempt) =>
              attempt.stageRunId === transition.stageRunId &&
              attempt.status === 'assigned',
          );
          if (assignedAttempts.length === 0)
            return result.err(
              conflictError({
                code: 'production_stage_attempts_missing',
                message:
                  'A completed production stage has no assigned order attempts.',
                safeMessage:
                  'A completed production stage has no assigned order attempts.',
              }),
            );
          for (const attempt of assignedAttempts) {
            const attemptDecision =
              deps.policy.evaluateProductionOrderStageAttemptTransition({
                state: attempt.status,
                event: 'complete_with_stage',
              });
            if (attemptDecision.tag === 'err')
              return result.err(
                conflictError({
                  code: attemptDecision.error.code.toLowerCase(),
                  message: attemptDecision.error.message,
                  safeMessage: attemptDecision.error.message,
                }),
              );
            attemptLifecycles.push({
              attemptId: attempt.id,
              stageRunId: attempt.stageRunId,
              lifecycle: attemptDecision.value,
            });
          }
        }

        let batchLifecycle: ProductionBatchLifecycleDecision | null = null;
        if (projection.batchStatus !== context.batch.status) {
          const batchDecision = deps.policy.evaluateProductionBatchTransition({
            state: context.batch.status,
            event: reconciliationBatchEvent(projection.batchStatus),
          });
          if (batchDecision.tag === 'err')
            return result.err(
              conflictError({
                code: batchDecision.error.code.toLowerCase(),
                message: batchDecision.error.message,
                safeMessage: batchDecision.error.message,
              }),
            );
          batchLifecycle = batchDecision.value;
        }

        let terminalLifecycle: ProductionTerminalLifecycleDecisions | null =
          null;
        if (projection.batchStatus === 'finished') {
          const orderLifecycles: ProductionOrderTerminalExecutionMutation[] =
            [];
          for (const order of context.activeOrders) {
            const resolved = deps.policy.resolveProductionOrderExecutionState({
              executionState: order.executionStatus,
              operationalStatus: order.status,
            });
            if (resolved.tag === 'err')
              return result.err(
                conflictError({
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
                conflictError({
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
                conflictError({
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
              conflictError({
                code: 'production_batch_orders_missing',
                message: 'The production batch has no active orders.',
                safeMessage: 'The production batch has no active orders.',
              }),
            );
          const runLifecycle = deps.policy.evaluateProductionRunTransition({
            state: context.run.status,
            event: 'complete_final_batch',
          });
          const shiftLifecycle = deps.policy.evaluateProductionShiftTransition({
            state: context.run.productionShiftStatus,
            event: 'close_after_execution',
          });
          if (
            runLifecycle.tag === 'err' ||
            runLifecycle.value.from !== 'started' ||
            runLifecycle.value.state !== 'completed'
          )
            return result.err(
              conflictError({
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
              conflictError({
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
        const mutation = await repo.reconcile({
          locationId: command.locationId,
          context,
          projection,
          stageLifecycles,
          batchLifecycle,
          attemptLifecycles,
          machineIds,
          terminalLifecycle,
          actorId: command.actorId,
          now,
        });
        if (mutation === null)
          return result.err(
            conflictError({
              code: 'progress_reconciliation_conflict',
              message:
                'Production changed before floor progress could be recorded.',
              safeMessage:
                'Production changed before floor progress could be recorded.',
            }),
          );

        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'batch_progress_reconciled',
          entityType: 'production_batch',
          entityId: command.productionBatchId,
          actorId: command.actorId,
          expectedVersion: command.expectedBatchVersion,
          idempotencyKey: command.idempotencyKey,
          payload: {
            recordedAt: now.toISOString(),
            reason: command.reason,
            note: command.note ?? null,
            currentMilestone: projection.currentMilestone,
            targetMilestone: projection.targetMilestone,
            machineIds,
            confirmation: {
              proposalHash: command.confirmation.proposalHash,
              reviewedEffects: confirmationRequired.effects,
            },
            stageBoundaries: projection.stages
              .filter((stage) => stage.currentStatus !== stage.nextStatus)
              .map((stage) => ({
                stageRunId: stage.stageRunId,
                stage: stage.stage,
                status: stage.nextStatus,
                actualStartProvenance:
                  stage.currentStatus === 'planned'
                    ? 'not_recorded'
                    : context.stages.find(
                        (current) => current.stageRunId === stage.stageRunId,
                      )?.actualStartProvenance,
                actualEndProvenance:
                  stage.nextStatus === 'completed' ? 'not_recorded' : undefined,
              })),
            result: {
              queueVersion: mutation.queueVersion,
              batchVersion: mutation.batchVersion,
              stageVersions: mutation.stageVersions,
              runCompleted: mutation.runCompleted,
              shiftClosed: mutation.shiftClosed,
            },
          },
          idempotency: { command: idempotency, result: mutation },
        });
        return result.ok(mutation);
      });

      if (
        outcome.tag === 'ok' &&
        outcome.value.status === 'reconciled' &&
        !outcome.value.replayed
      )
        deps.signals?.progressReconciled({
          target: outcome.value.milestone,
          runCompleted: outcome.value.runCompleted,
        });
      return outcome;
    } catch (error) {
      return result.err(
        mapUnknownError(error, (unknownCause) =>
          databaseError({
            code: 'progress_reconciliation_failed',
            message: 'Floor progress could not be recorded.',
            safeMessage: 'Floor progress could not be recorded.',
            status: 503,
            cause: unknownCause,
          }),
        ),
      );
    }
  };
