import { productionHistoryInvariantViolation } from '../../../language/history/production-history.error.ts';
import type { ProductionHistoryPlanSummary } from '../../../language/history/production-history.model.ts';
import type { ProductionHistoryPlanRow } from './production-history-row.adapter.ts';

const arrayLength = (value: unknown): number =>
  Array.isArray(value) ? value.length : 0;

export const mapProductionHistoryPlan = (
  row: ProductionHistoryPlanRow,
): ProductionHistoryPlanSummary => {
  if (
    row.status !== 'draft' &&
    row.status !== 'accepted' &&
    row.status !== 'superseded' &&
    row.status !== 'rejected'
  )
    throw productionHistoryInvariantViolation(
      'production_history_schedule_status_invalid',
      `Unknown schedule history status: ${row.status}.`,
    );

  return {
    scheduleRunId: row.id,
    productionShiftId: row.productionShiftId,
    linkedProductionRunId: row.linkedProductionRunId,
    status: row.status,
    shiftStartsAt: row.shiftStartsAt,
    shiftEndsAt: row.shiftEndsAt,
    algorithmVersion: row.algorithmVersion,
    schedulerConfigId: row.schedulerConfigId,
    inputSnapshotHash: row.inputSnapshotHash,
    outputPlanHash: row.outputPlanHash,
    pulseCapacityLbs: row.pulseCapacityLbs,
    batchCount: row.batchCount,
    makespanMinutes: row.makespanMinutes,
    plannedCompletionAt: row.plannedCompletionAt,
    warningCount: arrayLength(row.warnings),
    acknowledgedWarningCount: arrayLength(row.acknowledgedWarningCodes),
    createdAt: row.createdAt,
    acceptedAt: row.acceptedAt,
    acceptedBy: row.acceptedBy,
    supersededAt: row.supersededAt,
  };
};
