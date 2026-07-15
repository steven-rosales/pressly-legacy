import type {
  ProductionOrderSummary,
  ProductionShift,
  ScheduleProposal,
  SchedulerConfig,
} from '@pressly/contracts';
import type { laundryProduction } from '@pressly/db';
import type { SchedulingOutput } from '../production.port.ts';

export const asDate = (value: string): Date => new Date(value);

export const iso = (value: Date): string => value.toISOString();

const dueBucket = (dueAt: Date, now: Date): 'today' | 'tomorrow' | 'later' => {
  const day = 86_400_000;
  const start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const due = Date.UTC(
    dueAt.getUTCFullYear(),
    dueAt.getUTCMonth(),
    dueAt.getUTCDate(),
  );
  const distance = Math.floor((due - start) / day);
  return distance <= 0 ? 'today' : distance === 1 ? 'tomorrow' : 'later';
};

export const mapSchedule = (
  row: typeof laundryProduction.scheduleRuns.$inferSelect,
): ScheduleProposal => {
  const output = row.outputPlan as SchedulingOutput;
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
    acknowledgedWarningCodes:
      row.acknowledgedWarningCodes as ScheduleProposal['acknowledgedWarningCodes'],
    supersededAt: row.supersededAt === null ? null : iso(row.supersededAt),
  };
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
  stageFitAssertion:
    row.stageFitAssertion as SchedulerConfig['stageFitAssertion'],
  publishedAt: iso(row.publishedAt),
});

export const mapOrder = (
  row: typeof laundryProduction.productionOrders.$inferSelect,
  externalOrderId: string,
  now: Date,
): ProductionOrderSummary => {
  if (row.bagCount === null)
    throw new Error('Production order bag intake is incomplete.');

  return {
    id: row.id,
    externalOrderId,
    dueAt: iso(row.dueAt),
    dueBucket: dueBucket(row.dueAt, now),
    priority: row.priority,
    derivedWeightLbs: row.derivedWeightLbs,
    bagCount: row.bagCount,
    version: row.version,
  };
};
