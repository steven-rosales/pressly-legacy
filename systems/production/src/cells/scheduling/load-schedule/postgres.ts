import { isJsonObject, type JsonValue } from '@pressly/codec';
import type { PostgresDatabase } from '@pressly/postgres/client';
import { and, eq } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type { ScheduleProposal } from '../../../read-models/production-schedule/contract.ts';
import { invariantViolationError } from '@pressly/errors/factories';
import type { LoadScheduleRepository } from './types.ts';

type StoredStage = ScheduleProposal['batches'][number]['stages'][number];
type StoredBatch = ScheduleProposal['batches'][number];
type StoredWarning = ScheduleProposal['warnings'][number];

type StoredSchedulingOutput = Readonly<{
  algorithmVersion: 'fixed-pulse-ffd-v2';
  inputSnapshotHash: string;
  outputPlanHash: string;
  canonicalOutput: string;
  pulseMinutes: number;
  pulseCapacityLbs: number;
  batchCount: number;
  makespanMinutes: number;
  plannedCompletionAt: string;
  batches: readonly StoredBatch[];
  unplacedOrderIds: readonly string[];
  warnings: readonly StoredWarning[];
}>;

const warningCodes = new Set([
  'SHIFT_OVERFLOW',
  'OVERSIZED_ORDER',
  'NO_ACTIVE_WASHERS',
  'NO_ACTIVE_DRYERS',
  'NO_FOLDING_CAPACITY',
]);

const isString = (value: JsonValue | undefined): value is string =>
  typeof value === 'string';

const isNumber = (value: JsonValue | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isBoolean = (value: JsonValue | undefined): value is boolean =>
  typeof value === 'boolean';

const isStringArray = (
  value: JsonValue | undefined,
): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isStoredStage = (value: JsonValue): value is StoredStage =>
  isJsonObject(value) &&
  (value['stage'] === 'sorting' ||
    value['stage'] === 'washing' ||
    value['stage'] === 'drying' ||
    value['stage'] === 'folding_packaging') &&
  isString(value['startsAt']) &&
  isString(value['endsAt']) &&
  isStringArray(value['machineIds']);

const isStoredBatch = (value: JsonValue): value is StoredBatch =>
  isJsonObject(value) &&
  isNumber(value['sequence']) &&
  isStringArray(value['orderIds']) &&
  isNumber(value['derivedWeightLbs']) &&
  isNumber(value['bagCount']) &&
  Array.isArray(value['stages']) &&
  value['stages'].every(isStoredStage);

const isStoredWarning = (value: JsonValue): boolean =>
  isJsonObject(value) &&
  isString(value['code']) &&
  warningCodes.has(value['code']) &&
  isString(value['message']) &&
  isBoolean(value['blocking']) &&
  (value['orderIds'] === undefined || isStringArray(value['orderIds']));

const isStoredSchedulingOutput = (
  value: unknown,
): value is StoredSchedulingOutput =>
  isJsonObject(value) &&
  value['algorithmVersion'] === 'fixed-pulse-ffd-v2' &&
  isString(value['inputSnapshotHash']) &&
  isString(value['outputPlanHash']) &&
  isString(value['canonicalOutput']) &&
  isNumber(value['pulseMinutes']) &&
  isNumber(value['pulseCapacityLbs']) &&
  isNumber(value['batchCount']) &&
  isNumber(value['makespanMinutes']) &&
  isString(value['plannedCompletionAt']) &&
  Array.isArray(value['batches']) &&
  value['batches'].every(isStoredBatch) &&
  isStringArray(value['unplacedOrderIds']) &&
  Array.isArray(value['warnings']) &&
  value['warnings'].every(isStoredWarning);

const invalidOutputPlan = (): never => {
  throw invariantViolationError({
    code: 'production_schedule_output_plan_invalid',
    message: 'Stored production schedule output plan is invalid.',
    safeMessage: 'Stored production scheduling state is inconsistent.',
  });
};

const readSchedulingOutput = (value: unknown): StoredSchedulingOutput =>
  isStoredSchedulingOutput(value) ? value : invalidOutputPlan();

const readAcknowledgedWarningCodes = (
  value: unknown,
): ScheduleProposal['acknowledgedWarningCodes'] => {
  if (
    Array.isArray(value) &&
    value.every((code) => typeof code === 'string' && warningCodes.has(code))
  )
    return value as ScheduleProposal['acknowledgedWarningCodes'];

  throw invariantViolationError({
    code: 'production_schedule_acknowledged_warning_codes_invalid',
    message:
      'Stored production schedule acknowledged_warning_codes is invalid.',
    safeMessage: 'Stored production scheduling state is inconsistent.',
  });
};

const scheduleSelect = (schema: ProductionSchema) =>
  ({
    id: schema.scheduleRuns.id,
    productionShiftId: schema.scheduleRuns.productionShiftId,
    schedulerConfigId: schema.scheduleRuns.schedulerConfigId,
    status: schema.scheduleRuns.status,
    inputSnapshotHash: schema.scheduleRuns.inputSnapshotHash,
    outputPlanHash: schema.scheduleRuns.outputPlanHash,
    algorithmVersion: schema.scheduleRuns.algorithmVersion,
    pulseCapacityLbs: schema.scheduleRuns.pulseCapacityLbs,
    batchCount: schema.scheduleRuns.batchCount,
    makespanMinutes: schema.scheduleRuns.makespanMinutes,
    plannedCompletionAt: schema.scheduleRuns.plannedCompletionAt,
    outputPlan: schema.scheduleRuns.outputPlan,
    createdAt: schema.scheduleRuns.createdAt,
    acceptedAt: schema.scheduleRuns.acceptedAt,
    acceptedBy: schema.scheduleRuns.acceptedBy,
    acknowledgedWarningCodes: schema.scheduleRuns.acknowledgedWarningCodes,
    supersededAt: schema.scheduleRuns.supersededAt,
  }) as const;

type SchedulePersistenceRow = Pick<
  ProductionSchema['scheduleRuns']['$inferSelect'],
  keyof ReturnType<typeof scheduleSelect>
>;

const projectSchedule = (row: SchedulePersistenceRow): ScheduleProposal => {
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
    plannedCompletionAt: row.plannedCompletionAt.toISOString(),
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
    createdAt: row.createdAt.toISOString(),
    acceptedAt: row.acceptedAt === null ? null : row.acceptedAt.toISOString(),
    acceptedBy: row.acceptedBy,
    acknowledgedWarningCodes: [
      ...readAcknowledgedWarningCodes(row.acknowledgedWarningCodes),
    ],
    supersededAt:
      row.supersededAt === null ? null : row.supersededAt.toISOString(),
  };
};

export const makeLoadSchedulePostgresRepository = (
  database: PostgresDatabase,
  schema: ProductionSchema,
): LoadScheduleRepository => ({
  load: async ({ locationId, scheduleRunId }) => {
    const [row] = await database
      .select(scheduleSelect(schema))
      .from(schema.scheduleRuns)
      .where(
        and(
          eq(schema.scheduleRuns.locationId, locationId),
          eq(schema.scheduleRuns.id, scheduleRunId),
        ),
      )
      .limit(1);
    return row === undefined ? null : projectSchedule(row);
  },
});
