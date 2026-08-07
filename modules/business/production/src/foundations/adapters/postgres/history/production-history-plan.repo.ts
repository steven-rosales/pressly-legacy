import { sql } from '@pressly/db/query';
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
  cursorCreatedAtKey:
    sql<string>`to_char(${laundryProduction.scheduleRuns.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
      'cursor_created_at_key',
    ),
  acceptedAt: laundryProduction.scheduleRuns.acceptedAt,
  acceptedBy: laundryProduction.scheduleRuns.acceptedBy,
  supersededAt: laundryProduction.scheduleRuns.supersededAt,
} as const;
