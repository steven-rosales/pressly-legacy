import type * as laundryProduction from '@pressly/db/schema/laundry-production';
import { isJsonObject } from '@pressly/codec';
import { invariantViolationError } from '@pressly/errors/factories';
import type { SchedulerConfig } from '../../../language/scheduling/scheduler-config.model.ts';
import type { ScheduleProposal } from '../../../language/scheduling/schedule-proposal.entity.ts';
import type { ProductionShift } from '../../../language/shifts/production-shift.entity.ts';
import { readSchedulingOutput } from './production-schedule-json.persistence.mapper.ts';

const scheduleWarningCodes = new Set([
  'SHIFT_OVERFLOW',
  'OVERSIZED_ORDER',
  'NO_ACTIVE_WASHERS',
  'NO_ACTIVE_DRYERS',
  'NO_FOLDING_CAPACITY',
]);

const invalidStoredScheduleField = (field: string): never => {
  throw invariantViolationError({
    code: `production_schedule_${field}_invalid`,
    message: `Stored production schedule ${field} is invalid.`,
    safeMessage: 'Stored production scheduling state is inconsistent.',
  });
};

export const mapAcknowledgedWarningCodes = (
  value: unknown,
): ScheduleProposal['acknowledgedWarningCodes'] => {
  if (
    !Array.isArray(value) ||
    !value.every(
      (code) => typeof code === 'string' && scheduleWarningCodes.has(code),
    )
  )
    return invalidStoredScheduleField('acknowledged_warning_codes');
  return value as ScheduleProposal['acknowledgedWarningCodes'];
};

const mapStageFitAssertion = (
  value: unknown,
): SchedulerConfig['stageFitAssertion'] => {
  if (
    !isJsonObject(value) ||
    value['sortingFits'] !== true ||
    value['washingFits'] !== true ||
    value['dryingFits'] !== true ||
    typeof value['assertedBy'] !== 'string' ||
    typeof value['assertedAt'] !== 'string'
  )
    return invalidStoredScheduleField('stage_fit_assertion');

  return {
    sortingFits: true,
    washingFits: true,
    dryingFits: true,
    assertedBy: value['assertedBy'],
    assertedAt: value['assertedAt'],
  };
};

export const asDate = (value: string): Date => new Date(value);

export const iso = (value: Date): string => value.toISOString();

export const mapSchedule = (
  row: typeof laundryProduction.scheduleRuns.$inferSelect,
) => {
  const output = readSchedulingOutput(row.outputPlan);
  return {
    scheduleRunId: row.id,
    productionShiftId: row.productionShiftId,
    schedulerConfigId: row.schedulerConfigId,
    status: row.status as ScheduleProposal['status'],
    inputSnapshotHash: row.inputSnapshotHash,
    outputPlanHash: row.outputPlanHash,
    algorithmVersion:
      row.algorithmVersion as ScheduleProposal['algorithmVersion'],
    pulseMinutes: output.pulseMinutes,
    pulseCapacityLbs: row.pulseCapacityLbs,
    batchCount: row.batchCount,
    makespanMinutes: row.makespanMinutes,
    plannedCompletionAt: iso(row.plannedCompletionAt),
    batches: output.batches.map((batch) => ({
      ...batch,
      orderIds: [...batch.orderIds],
      stages: batch.stages.map((stage) => ({
        ...stage,
        machineIds: [...stage.machineIds],
      })),
    })),
    unplacedOrderIds: [...output.unplacedOrderIds],
    warnings: output.warnings.map((warning) => ({
      code: warning.code,
      message: warning.message,
      blocking: warning.blocking,
      ...(warning.orderIds === undefined
        ? {}
        : { orderIds: [...warning.orderIds] }),
    })),
    createdAt: iso(row.createdAt),
    acceptedAt: row.acceptedAt === null ? null : iso(row.acceptedAt),
    acceptedBy: row.acceptedBy,
    acknowledgedWarningCodes: [
      ...mapAcknowledgedWarningCodes(row.acknowledgedWarningCodes),
    ],
    supersededAt: row.supersededAt === null ? null : iso(row.supersededAt),
  } satisfies ScheduleProposal;
};

export const mapShift = (
  row: typeof laundryProduction.productionShifts.$inferSelect,
): ProductionShift => ({
  id: row.id,
  locationId: row.locationId,
  startsAt: iso(row.startsAt),
  endsAt: iso(row.endsAt),
  timezone: row.timezone,
  effectiveFolderCount: row.effectiveFolderCount,
  status: row.status as ProductionShift['status'],
  version: row.version,
});

export const mapConfig = (
  row: typeof laundryProduction.schedulerConfigs.$inferSelect,
): SchedulerConfig => ({
  id: row.id,
  pulseMinutes: row.pulseMinutes,
  foldLbsPerFolderMinute: row.foldLbsPerFolderMinute,
  algorithmVersion: row.algorithmVersion as SchedulerConfig['algorithmVersion'],
  version: row.version,
  stageFitAssertion: mapStageFitAssertion(row.stageFitAssertion),
  publishedAt: iso(row.publishedAt),
});
