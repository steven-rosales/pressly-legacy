import { result } from '@pressly/kernel';
import type {
  ProductionBatchProgressReconciliationResult,
  ProductionFloorProgressTarget,
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

const activeStageForTarget = (
  target: ProductionFloorProgressTarget,
): ReconciliationStage['stage'] | null => {
  if (target === 'sorting_started') return 'sorting';
  if (target === 'washing_started') return 'washing';
  if (target === 'drying_started') return 'drying';
  if (target === 'folding_packaging_started') return 'folding_packaging';
  return null;
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
    policy: ProductionPolicyPort;
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
            productionError(
              'PRODUCTION_BATCH_NOT_FOUND',
              'The production batch was not found in this run.',
              404,
            ),
          );
        if (context.run.queueVersion !== command.expectedQueueVersion)
          return result.err(
            productionError(
              'PRODUCTION_QUEUE_VERSION_CONFLICT',
              'The production queue changed before floor progress was recorded.',
            ),
          );
        if (context.batch.version !== command.expectedBatchVersion)
          return result.err(
            productionError(
              'PRODUCTION_BATCH_VERSION_CONFLICT',
              'The production batch changed before floor progress was recorded.',
            ),
          );
        if (
          !exactStageVersionsMatch(
            context.stages,
            command.expectedStageVersions,
          )
        )
          return result.err(
            productionError(
              'STAGE_RUN_VERSION_CONFLICT',
              'A production stage changed before floor progress was recorded.',
            ),
          );

        const activeStage = activeStageForTarget(command.target);
        const selectedMachines = context.machines.filter((machine) =>
          command.machineIds.includes(machine.id),
        );
        if (selectedMachines.length !== command.machineIds.length)
          return result.err(
            productionError(
              'MACHINE_NOT_FOUND',
              'One or more requested machines are not available.',
              404,
            ),
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
              productionError(
                machineDecision.error.code,
                machineDecision.error.message,
              ),
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
            productionError(decision.error.code, decision.error.message),
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
            productionError(
              'PROGRESS_RECONCILIATION_CONFIRMATION_STALE',
              'The floor-progress confirmation is no longer current.',
            ),
          );

        const now = deps.clock.now();
        const mutation = await repo.reconcile({
          locationId: command.locationId,
          context,
          projection,
          machineIds,
          actorId: command.actorId,
          now,
        });
        if (mutation === null)
          return result.err(
            productionError(
              'PROGRESS_RECONCILIATION_CONFLICT',
              'Production changed before floor progress could be recorded.',
            ),
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
        productionError(
          'PROGRESS_RECONCILIATION_FAILED',
          'Floor progress could not be recorded.',
          500,
          error,
        ),
      );
    }
  };
