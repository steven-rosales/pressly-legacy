import { sha256Text } from '@pressly/codec/node';
import type {
  FloorProgressReason,
  ReconciliationConfirmationRequired,
  ReconciliationContext,
  ReconciliationProjection,
} from './types.ts';

export type ReconciliationConfirmationInput = Readonly<{
  locationId: string;
  actorId: string;
  context: ReconciliationContext;
  projection: ReconciliationProjection;
  reason: FloorProgressReason;
  note: string | null;
  machineIds: readonly string[];
}>;

const effects = (
  input: Pick<ReconciliationConfirmationInput, 'context' | 'projection'>,
): ReconciliationConfirmationRequired['effects'] => {
  const finishesBatch = input.projection.targetMilestone === 'finished';
  const finishesRun =
    finishesBatch &&
    input.context.otherBatchStatuses.every((status) => status === 'finished');
  return {
    completedStages: [...input.projection.completedStages],
    activeStage: input.projection.activeStage,
    finishesBatch,
    finishesRun,
    closesShift:
      finishesRun &&
      input.context.otherRunStatuses.every((status) => status === 'completed'),
  };
};

const canonical = (input: ReconciliationConfirmationInput): string =>
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

export const makeReconciliationConfirmationRequired = (
  input: ReconciliationConfirmationInput,
): ReconciliationConfirmationRequired => ({
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
  confirmation: { proposalHash: sha256Text(canonical(input)) },
  effects: effects(input),
  replayed: false,
});

export const matchesReconciliationConfirmation = (
  input: ReconciliationConfirmationInput &
    Readonly<{ confirmation: Readonly<{ proposalHash: string }> }>,
): boolean => input.confirmation.proposalHash === sha256Text(canonical(input));
