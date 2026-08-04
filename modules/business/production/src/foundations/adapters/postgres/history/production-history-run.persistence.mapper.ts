import { productionHistoryInvariantViolation } from '../../../language/history/production-history.error.ts';
import type {
  ProductionHistoryBatchSummary,
  ProductionHistoryOrderMembership,
  ProductionHistoryOrderStatus,
  ProductionHistoryPlacementProvenance,
  ProductionHistoryRunSummary,
  ProductionHistoryStageKind,
  ProductionHistoryStageProgress,
} from '../../../language/history/production-history.model.ts';
import type {
  ProductionHistoryBatchRow,
  ProductionHistoryOrderMembershipRow,
  ProductionHistoryRunRow,
  ProductionHistoryRunStatistics,
  ProductionHistoryStageRow,
} from './production-history-row.adapter.ts';

export const emptyProductionHistoryRunStatistics =
  (): ProductionHistoryRunStatistics => ({
    batchCount: 0,
    completedBatchCount: 0,
    orderCount: 0,
    priorityOrderCount: 0,
    totalWeightLbs: 0,
  });

export const mapProductionHistoryRun = (
  row: ProductionHistoryRunRow,
  statistics: ProductionHistoryRunStatistics,
): ProductionHistoryRunSummary => {
  if (row.status !== 'started' && row.status !== 'completed')
    throw productionHistoryInvariantViolation(
      'production_history_run_status_invalid',
      `Unknown production-run history status: ${row.status}.`,
    );
  if (row.startedAt === null)
    throw productionHistoryInvariantViolation(
      'production_history_run_start_missing',
      'Production-run history is missing its start boundary.',
    );

  return {
    productionRunId: row.id,
    productionShiftId: row.productionShiftId,
    scheduleRunId: row.scheduleRunId,
    status: row.status,
    shiftStartsAt: row.shiftStartsAt,
    shiftEndsAt: row.shiftEndsAt,
    timezone: row.timezone,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    plannedCompletionAt: row.plannedCompletionAt,
    ...statistics,
    queueVersion: row.queueVersion,
    overtimeAcknowledged: row.overtimeAcknowledgedAt !== null,
    createdAt: row.createdAt,
  };
};

const batchStatus = (
  status: string,
): ProductionHistoryBatchSummary['status'] => {
  switch (status) {
    case 'queued':
    case 'sorting':
    case 'washing':
    case 'drying':
    case 'folding_packaging':
    case 'finished':
      return status;
    default:
      throw productionHistoryInvariantViolation(
        'production_history_batch_status_invalid',
        `Unknown production-batch history status: ${status}.`,
      );
  }
};

const stageStatus = (
  status: string,
): ProductionHistoryStageProgress['status'] => {
  if (status === 'planned' || status === 'started' || status === 'completed')
    return status;
  throw productionHistoryInvariantViolation(
    'production_history_stage_status_invalid',
    `Unknown stage-run history status: ${status}.`,
  );
};

const stageKind = (stage: string): ProductionHistoryStageKind => {
  if (
    stage === 'sorting' ||
    stage === 'washing' ||
    stage === 'drying' ||
    stage === 'folding_packaging'
  )
    return stage;
  throw productionHistoryInvariantViolation(
    'production_history_stage_kind_invalid',
    `Unknown stage-run history kind: ${stage}.`,
  );
};

const orderStatus = (status: string): ProductionHistoryOrderStatus => {
  switch (status) {
    case 'release_pending':
    case 'intake_pending':
    case 'eligible':
    case 'ineligible':
    case 'scheduled':
    case 'finished':
      return status;
    default:
      throw productionHistoryInvariantViolation(
        'production_history_order_status_invalid',
        `Unknown production-order history status: ${status}.`,
      );
  }
};

const placementProvenance = (
  provenance: string,
): ProductionHistoryPlacementProvenance => {
  switch (provenance) {
    case 'initial_schedule':
    case 'automatic':
    case 'manager_exact':
    case 'manual_rebatch':
    case 'exception_route':
      return provenance;
    default:
      throw productionHistoryInvariantViolation(
        'production_history_placement_provenance_invalid',
        `Unknown production-order placement provenance: ${provenance}.`,
      );
  }
};

export const mapProductionHistoryBatch = (
  row: ProductionHistoryBatchRow,
): ProductionHistoryBatchSummary => ({
  productionBatchId: row.id,
  sequence: row.sequence,
  status: batchStatus(row.status),
  derivedWeightLbs: row.derivedWeightLbs,
  pulseCapacityLbs: row.pulseCapacityLbs,
  currentOrderCount: Number(row.currentOrderCount),
  historicalOrderCount: Number(row.historicalOrderCount),
  startedAt: row.startedAt,
  finishedAt: row.finishedAt,
});

export const mapProductionHistoryStage = (
  row: ProductionHistoryStageRow,
): ProductionHistoryStageProgress => ({
  stageRunId: row.stageRunId,
  productionBatchId: row.productionBatchId,
  batchSequence: row.batchSequence,
  stage: stageKind(row.stage),
  status: stageStatus(row.status),
  plannedStartAt: row.plannedStartAt,
  plannedEndAt: row.plannedEndAt,
  actualStartAt: row.actualStartAt,
  actualEndAt: row.actualEndAt,
  actualStartProvenance: row.actualStartProvenance,
  actualEndProvenance: row.actualEndProvenance,
  startedBy: row.startedBy,
  completedBy: row.completedBy,
  machineCount: Number(row.machineCount),
});

export const mapProductionHistoryOrderMembership = (
  row: ProductionHistoryOrderMembershipRow,
): ProductionHistoryOrderMembership => {
  const shared = {
    membershipId: row.membershipId,
    productionOrderId: row.productionOrderId,
    externalOrderId: row.externalOrderId,
    orderStatus: orderStatus(row.orderStatus),
    derivedWeightLbs: row.derivedWeightLbs,
    bagCount: row.bagCount,
    productionBatchId: row.productionBatchId,
    batchSequence: row.batchSequence,
    placementProvenance: placementProvenance(row.placementProvenance),
  } as const;

  if (row.active) {
    if (
      row.releasedAt !== null ||
      row.releasedBy !== null ||
      row.releaseReason !== null
    )
      throw productionHistoryInvariantViolation(
        'production_history_current_membership_release_metadata_invalid',
        'Current production-order membership has release metadata.',
      );
    return {
      ...shared,
      placement: {
        state: 'current',
        placedAt: row.placedAt,
        placedBy: row.placedBy,
      },
    };
  }

  const releaseMetadata = [row.releasedAt, row.releasedBy, row.releaseReason];
  if (
    !releaseMetadata.every((value) => value === null) &&
    !releaseMetadata.every((value) => value !== null)
  )
    throw productionHistoryInvariantViolation(
      'production_history_released_membership_metadata_incomplete',
      'Released production-order membership has partial release metadata.',
    );
  return {
    ...shared,
    placement: {
      state: 'released',
      placedAt: row.placedAt,
      placedBy: row.placedBy,
      releasedAt: row.releasedAt,
      releasedBy: row.releasedBy,
      reason: row.releaseReason,
    },
  };
};
