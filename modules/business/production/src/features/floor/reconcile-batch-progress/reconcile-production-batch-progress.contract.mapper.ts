import type {
  ProductionBatchProgressReconciliationResult as ProductionBatchProgressReconciliationWireResult,
  ReconcileProductionBatchProgressCommand as ReconcileProductionBatchProgressWireCommand,
} from '@pressly/contracts/production';
import type {
  ProductionBatchProgressReconciliationResult,
  ReconcileProductionBatchProgressCommand,
} from './reconcile-production-batch-progress.model.ts';

export type ReconcileProductionBatchProgressRequestScope = Readonly<{
  locationId: string;
  productionRunId: string;
  productionBatchId: string;
  actorId: string;
}>;

type ReconcileProductionBatchProgressWireRequest = Omit<
  ReconcileProductionBatchProgressWireCommand,
  'locationId' | 'productionRunId' | 'productionBatchId'
>;

export const toReconcileProductionBatchProgressCommand = (
  request: ReconcileProductionBatchProgressWireRequest,
  scope: ReconcileProductionBatchProgressRequestScope,
): ReconcileProductionBatchProgressCommand => ({
  ...scope,
  expectedQueueVersion: request.expectedQueueVersion,
  expectedBatchVersion: request.expectedBatchVersion,
  expectedStageVersions: request.expectedStageVersions.map((stage) => ({
    stageRunId: stage.stageRunId,
    version: stage.version,
  })),
  target: request.target,
  reason: request.reason,
  note: request.note ?? null,
  machineIds: [...request.machineIds],
  confirmation:
    request.confirmation === undefined
      ? null
      : { proposalHash: request.confirmation.proposalHash },
  idempotencyKey: request.idempotencyKey,
});

export const toProductionBatchProgressReconciliationResult = (
  result: ProductionBatchProgressReconciliationResult,
): ProductionBatchProgressReconciliationWireResult =>
  result.status === 'confirmation_required'
    ? {
        status: result.status,
        productionRunId: result.productionRunId,
        productionBatchId: result.productionBatchId,
        currentMilestone: result.currentMilestone,
        targetMilestone: result.targetMilestone,
        queueVersion: result.queueVersion,
        batchVersion: result.batchVersion,
        stageVersions: result.stageVersions.map((stage) => ({ ...stage })),
        confirmation: { ...result.confirmation },
        effects: {
          completedStages: [...result.effects.completedStages],
          activeStage: result.effects.activeStage,
          finishesBatch: result.effects.finishesBatch,
          finishesRun: result.effects.finishesRun,
          closesShift: result.effects.closesShift,
        },
        replayed: result.replayed,
      }
    : {
        status: result.status,
        productionRunId: result.productionRunId,
        productionBatchId: result.productionBatchId,
        milestone: result.milestone,
        queueVersion: result.queueVersion,
        batchVersion: result.batchVersion,
        stageVersions: result.stageVersions.map((stage) => ({ ...stage })),
        finishedOrderCount: result.finishedOrderCount,
        finishedBagCount: result.finishedBagCount,
        runCompleted: result.runCompleted,
        shiftClosed: result.shiftClosed,
        replayed: result.replayed,
      };
