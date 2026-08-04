import { isJsonObject, type JsonObject, type JsonValue } from '@pressly/codec';
import { invariantViolationError } from '@pressly/errors/factories';
import type {
  SchedulingInput,
  SchedulingOutput,
} from '../../../language/scheduling/production-scheduling.model.ts';

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

const isSchedulingOrder = (value: JsonValue): boolean =>
  isJsonObject(value) &&
  isString(value['id']) &&
  isString(value['externalOrderId']) &&
  isString(value['dueAt']) &&
  isBoolean(value['priority']) &&
  isNumber(value['derivedWeightLbs']) &&
  isNumber(value['bagCount']) &&
  isNumber(value['version']);

const isSchedulingMachine = (value: JsonValue): boolean =>
  isJsonObject(value) &&
  isString(value['id']) &&
  (value['stationKind'] === 'washing' || value['stationKind'] === 'drying') &&
  isNumber(value['effectiveCapacityLbs']) &&
  isBoolean(value['active']);

const isSchedulingShift = (value: JsonValue | undefined): boolean =>
  isJsonObject(value) &&
  isString(value['id']) &&
  isString(value['startsAt']) &&
  isString(value['endsAt']) &&
  isString(value['timezone']) &&
  isNumber(value['effectiveFolderCount']) &&
  isNumber(value['version']);

const isSchedulingConfig = (value: JsonValue | undefined): boolean =>
  isJsonObject(value) &&
  isString(value['id']) &&
  isNumber(value['pulseMinutes']) &&
  isNumber(value['foldLbsPerFolderMinute']) &&
  value['algorithmVersion'] === 'fixed-pulse-ffd-v2' &&
  isNumber(value['version']);

const isSchedulingInput = (value: unknown): value is SchedulingInput =>
  isJsonObject(value) &&
  Array.isArray(value['orders']) &&
  value['orders'].every(isSchedulingOrder) &&
  Array.isArray(value['machines']) &&
  value['machines'].every(isSchedulingMachine) &&
  isSchedulingShift(value['shift']) &&
  isSchedulingConfig(value['config']);

const isSchedulingStage = (value: JsonValue): boolean =>
  isJsonObject(value) &&
  (value['stage'] === 'sorting' ||
    value['stage'] === 'washing' ||
    value['stage'] === 'drying' ||
    value['stage'] === 'folding_packaging') &&
  isString(value['startsAt']) &&
  isString(value['endsAt']) &&
  isStringArray(value['machineIds']);

const isSchedulingBatch = (value: JsonValue): boolean =>
  isJsonObject(value) &&
  isNumber(value['sequence']) &&
  isStringArray(value['orderIds']) &&
  isNumber(value['derivedWeightLbs']) &&
  isNumber(value['bagCount']) &&
  Array.isArray(value['stages']) &&
  value['stages'].every(isSchedulingStage);

const warningCodes = new Set([
  'SHIFT_OVERFLOW',
  'OVERSIZED_ORDER',
  'NO_ACTIVE_WASHERS',
  'NO_ACTIVE_DRYERS',
  'NO_FOLDING_CAPACITY',
]);

const isSchedulingWarning = (value: JsonValue): boolean =>
  isJsonObject(value) &&
  isString(value['code']) &&
  warningCodes.has(value['code']) &&
  isString(value['message']) &&
  isBoolean(value['blocking']) &&
  (value['orderIds'] === undefined || isStringArray(value['orderIds']));

const isSchedulingOutput = (value: unknown): value is SchedulingOutput =>
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
  value['batches'].every(isSchedulingBatch) &&
  isStringArray(value['unplacedOrderIds']) &&
  Array.isArray(value['warnings']) &&
  value['warnings'].every(isSchedulingWarning);

const invalidScheduleJson = (field: 'input_snapshot' | 'output_plan') =>
  invariantViolationError({
    code: `production_schedule_${field}_invalid`,
    message: `Stored production schedule ${field.replace('_', ' ')} is invalid.`,
    safeMessage: 'Stored production scheduling state is inconsistent.',
  });

export const readSchedulingInput = (value: unknown): SchedulingInput => {
  if (!isSchedulingInput(value)) throw invalidScheduleJson('input_snapshot');
  return value;
};

export const readSchedulingOutput = (value: unknown): SchedulingOutput => {
  if (!isSchedulingOutput(value)) throw invalidScheduleJson('output_plan');
  return value;
};

export const schedulingInputJson = (value: SchedulingInput): JsonObject => {
  if (!isSchedulingInput(value)) throw invalidScheduleJson('input_snapshot');
  return value;
};

export const schedulingOutputJson = (value: SchedulingOutput): JsonObject => {
  if (!isSchedulingOutput(value)) throw invalidScheduleJson('output_plan');
  return value;
};
