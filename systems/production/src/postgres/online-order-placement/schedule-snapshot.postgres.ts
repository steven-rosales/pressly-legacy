import { isJsonObject, type JsonValue } from '@pressly/codec';
import { invariantViolationError } from '@pressly/errors/factories';
import type { OnlinePlacementInput } from '../../model/online-order-placement/model.ts';

type StoredSchedulingInput = Readonly<{
  orders: readonly Readonly<{
    id: string;
    externalOrderId: string;
    dueAt: string;
    priority: boolean;
    derivedWeightLbs: number;
    bagCount: number;
    version: number;
  }>[];
  machines: OnlinePlacementInput['machines'];
  shift: Readonly<{
    id: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    effectiveFolderCount: number;
    version: number;
  }>;
  config: Readonly<{
    id: string;
    pulseMinutes: number;
    foldLbsPerFolderMinute: number;
    algorithmVersion: 'fixed-pulse-ffd-v2';
    version: number;
  }>;
}>;

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
  batches: readonly Readonly<{
    sequence: number;
    orderIds: readonly string[];
    derivedWeightLbs: number;
    bagCount: number;
    stages: readonly OnlinePlacementInput['batches'][number]['stages'][number][];
  }>[];
  unplacedOrderIds: readonly string[];
  warnings: readonly Readonly<{
    code: string;
    message: string;
    blocking: boolean;
    orderIds?: readonly string[];
  }>[];
}>;

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

const isSchedulingMachine = (
  value: JsonValue,
): value is OnlinePlacementInput['machines'][number] =>
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

const isSchedulingInput = (value: unknown): value is StoredSchedulingInput =>
  isJsonObject(value) &&
  Array.isArray(value['orders']) &&
  value['orders'].every(isSchedulingOrder) &&
  Array.isArray(value['machines']) &&
  value['machines'].every(isSchedulingMachine) &&
  isSchedulingShift(value['shift']) &&
  isSchedulingConfig(value['config']);

const isSchedulingStage = (
  value: JsonValue,
): value is OnlinePlacementInput['batches'][number]['stages'][number] =>
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

const isSchedulingOutput = (value: unknown): value is StoredSchedulingOutput =>
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

export const readOnlineOrderPlacementScheduleInput = (
  value: unknown,
): StoredSchedulingInput => {
  if (!isSchedulingInput(value)) throw invalidScheduleJson('input_snapshot');
  return value;
};

export const readOnlineOrderPlacementScheduleOutput = (
  value: unknown,
): StoredSchedulingOutput => {
  if (!isSchedulingOutput(value)) throw invalidScheduleJson('output_plan');
  return value;
};
