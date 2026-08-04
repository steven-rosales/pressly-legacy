import * as laundryProduction from '@pressly/db/schema/laundry-production';

export const productionHistoryPlanSelect = {
  id: laundryProduction.scheduleRuns.id,
  productionShiftId: laundryProduction.scheduleRuns.productionShiftId,
  linkedProductionRunId: laundryProduction.productionRuns.id,
  status: laundryProduction.scheduleRuns.status,
  shiftStartsAt: laundryProduction.productionShifts.startsAt,
  shiftEndsAt: laundryProduction.productionShifts.endsAt,
  algorithmVersion: laundryProduction.scheduleRuns.algorithmVersion,
  schedulerConfigId: laundryProduction.scheduleRuns.schedulerConfigId,
  inputSnapshotHash: laundryProduction.scheduleRuns.inputSnapshotHash,
  outputPlanHash: laundryProduction.scheduleRuns.outputPlanHash,
  pulseCapacityLbs: laundryProduction.scheduleRuns.pulseCapacityLbs,
  batchCount: laundryProduction.scheduleRuns.batchCount,
  makespanMinutes: laundryProduction.scheduleRuns.makespanMinutes,
  plannedCompletionAt: laundryProduction.scheduleRuns.plannedCompletionAt,
  warnings: laundryProduction.scheduleRuns.warnings,
  acknowledgedWarningCodes:
    laundryProduction.scheduleRuns.acknowledgedWarningCodes,
  createdAt: laundryProduction.scheduleRuns.createdAt,
  acceptedAt: laundryProduction.scheduleRuns.acceptedAt,
  acceptedBy: laundryProduction.scheduleRuns.acceptedBy,
  supersededAt: laundryProduction.scheduleRuns.supersededAt,
} as const;
