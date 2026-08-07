import { sha256Text } from '@pressly/codec/node';
import type {
  ProductionBatchProgressReconciliationConfirmationRequiredResult,
  ProductionFloorProgressReason,
  ReconciliationContext,
  ReconciliationProjection,
} from './reconcile-production-batch-progress.model.ts';

type ConfirmationInput = Readonly<{
  locationId: string;
  actorId: string;
  context: ReconciliationContext;
  projection: ReconciliationProjection;
  reason: ProductionFloorProgressReason;
  note: string | null;
  machineIds: readonly string[];
}>;

const effects = (
  input: Pick<ConfirmationInput, 'context' | 'projection'>,
): ProductionBatchProgressReconciliationConfirmationRequiredResult['effects'] => {
  const finishesBatch = input.projection.targetMilestone === 'finished';
  const finishesRun =
    finishesBatch &&
    input.context.otherBatchStatuses.every((status) => status === 'finished');
  const closesShift =
    finishesRun &&
    input.context.otherRunStatuses.every((status) => status === 'completed');
  return {
    completedStages: [...input.projection.completedStages],
    activeStage: input.projection.activeStage,
    finishesBatch,
    finishesRun,
    closesShift,
  };
};

const canonicalConfirmation = (input: ConfirmationInput): string =>
  JSON.stringify({
    version: 1,
    operation: 'production-batch-progress-reconciliation',
    locationId: input.locationId,
    actorId: input.actorId,
    productionRunId: input.context.run.id,
    productionBatchId: input.context.batch.id,
    queueVersion: input.context.run.queueVersion,
    batchVersion: input.context.batch.version,
    stageVersions: input.context.stages
      .map((stage) => ({
        stageRunId: stage.stageRunId,
        stage: stage.stage,
        status: stage.status,
        version: stage.version,
      }))
      .sort((left, right) => left.stage.localeCompare(right.stage)),
    currentMilestone: input.projection.currentMilestone,
    targetMilestone: input.projection.targetMilestone,
    reason: input.reason,
    note: input.note,
    machineIds: [...input.machineIds].sort(),
    effects: effects(input),
  });

const proposalHash = (input: ConfirmationInput): string =>
  sha256Text(canonicalConfirmation(input));

export const makeProgressReconciliationConfirmationRequired = (
  input: ConfirmationInput,
): ProductionBatchProgressReconciliationConfirmationRequiredResult => ({
  status: 'confirmation_required',
  productionRunId: input.context.run.id,
  productionBatchId: input.context.batch.id,
  currentMilestone: input.projection.currentMilestone,
  targetMilestone: input.projection.targetMilestone,
  queueVersion: input.context.run.queueVersion,
  batchVersion: input.context.batch.version,
  stageVersions: input.context.stages.map((stage) => ({
    stageRunId: stage.stageRunId,
    version: stage.version,
  })),
  confirmation: { proposalHash: proposalHash(input) },
  effects: effects(input),
  replayed: false,
});

export const matchesProgressReconciliationConfirmation = (
  input: ConfirmationInput &
    Readonly<{ confirmation: Readonly<{ proposalHash: string }> }>,
): boolean => input.confirmation.proposalHash === proposalHash(input);
