import { createHash } from 'node:crypto';
import type {
  ProposedStage,
  ProposeSchedule,
  SchedulingBatch,
  SchedulingInput,
  SchedulingMachine,
  SchedulingOrder,
  SchedulingStageKind,
  SchedulingWarning,
} from './propose-schedule.port.ts';

const stages: readonly SchedulingStageKind[] = [
  'sorting',
  'washing',
  'drying',
  'folding_packaging',
];

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);

  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );

  return value;
};

export const canonicalJson = (value: unknown): string =>
  JSON.stringify(canonicalize(value));

export const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const addMinutes = (instant: string, minutes: number): string =>
  new Date(Date.parse(instant) + minutes * 60_000).toISOString();

const localDate = (instant: string, timezone: string): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';

  return `${part('year')}-${part('month')}-${part('day')}`;
};

const dayNumber = (date: string): number =>
  Date.parse(`${date}T00:00:00.000Z`) / 86_400_000;

const dueBucket = (order: SchedulingOrder, input: SchedulingInput): number => {
  const shiftDay = dayNumber(
    localDate(input.shift.startsAt, input.shift.timezone),
  );
  const dueDay = dayNumber(localDate(order.dueAt, input.shift.timezone));
  const distance = dueDay - shiftDay;

  return distance <= 0 ? 0 : distance === 1 ? 1 : 2;
};

const compareOrders =
  (input: SchedulingInput) =>
  (left: SchedulingOrder, right: SchedulingOrder): number =>
    Number(right.priority) - Number(left.priority) ||
    dueBucket(left, input) - dueBucket(right, input) ||
    right.derivedWeightLbs - left.derivedWeightLbs ||
    Date.parse(left.dueAt) - Date.parse(right.dueAt) ||
    left.id.localeCompare(right.id);

const fleetCapacity = (
  machines: readonly SchedulingMachine[],
  kind: SchedulingMachine['stationKind'],
): number =>
  machines
    .filter((machine) => machine.active && machine.stationKind === kind)
    .reduce((total, machine) => total + machine.effectiveCapacityLbs, 0);

const selectMachines = (
  machines: readonly SchedulingMachine[],
  kind: SchedulingMachine['stationKind'],
  requiredWeightLbs: number,
): readonly string[] => {
  const available = machines
    .filter((machine) => machine.active && machine.stationKind === kind)
    .slice()
    .sort(
      (left, right) =>
        right.effectiveCapacityLbs - left.effectiveCapacityLbs ||
        left.id.localeCompare(right.id),
    );
  const selected: string[] = [];
  let capacity = 0;

  for (const machine of available) {
    selected.push(machine.id);
    capacity += machine.effectiveCapacityLbs;
    if (capacity >= requiredWeightLbs) break;
  }

  return selected.sort();
};

type MutableBatch = {
  orders: SchedulingOrder[];
  weightLbs: number;
};

const packOrders = (
  orders: readonly SchedulingOrder[],
  capacityLbs: number,
): readonly MutableBatch[] => {
  const batches: MutableBatch[] = [];

  for (const order of orders) {
    const target = batches.find(
      (batch) => batch.weightLbs + order.derivedWeightLbs <= capacityLbs,
    );

    if (target === undefined) {
      batches.push({ orders: [order], weightLbs: order.derivedWeightLbs });
      continue;
    }

    target.orders.push(order);
    target.weightLbs += order.derivedWeightLbs;
  }

  return batches;
};

const buildStages = (
  input: SchedulingInput,
  batchSequence: number,
  batchWeightLbs: number,
): readonly ProposedStage[] =>
  stages.map((stage, stageIndex) => {
    const offset = (batchSequence + stageIndex) * input.config.pulseMinutes;
    const startsAt = addMinutes(input.shift.startsAt, offset);

    return {
      stage,
      startsAt,
      endsAt: addMinutes(startsAt, input.config.pulseMinutes),
      machineIds:
        stage === 'washing' || stage === 'drying'
          ? selectMachines(input.machines, stage, batchWeightLbs)
          : [],
    };
  });

const capacityWarnings = (
  washerCapacity: number,
  dryerCapacity: number,
  foldingCapacity: number,
): SchedulingWarning[] => [
  ...(washerCapacity > 0
    ? []
    : [
        {
          code: 'NO_ACTIVE_WASHERS' as const,
          message: 'No active washer capacity is available.',
          blocking: true,
        },
      ]),
  ...(dryerCapacity > 0
    ? []
    : [
        {
          code: 'NO_ACTIVE_DRYERS' as const,
          message: 'No active dryer capacity is available.',
          blocking: true,
        },
      ]),
  ...(foldingCapacity > 0
    ? []
    : [
        {
          code: 'NO_FOLDING_CAPACITY' as const,
          message: 'No folding capacity is available.',
          blocking: true,
        },
      ]),
];

export const proposeSchedule: ProposeSchedule = (input) => {
  const inputSnapshotHash = sha256(canonicalJson(input));
  const washerCapacity = fleetCapacity(input.machines, 'washing');
  const dryerCapacity = fleetCapacity(input.machines, 'drying');
  const foldingCapacity =
    input.config.foldLbsPerFolderMinute *
    input.shift.effectiveFolderCount *
    input.config.pulseMinutes;
  const pulseCapacityLbs = Math.min(
    washerCapacity,
    dryerCapacity,
    foldingCapacity,
  );
  const warnings = capacityWarnings(
    washerCapacity,
    dryerCapacity,
    foldingCapacity,
  );
  const candidates = input.orders
    .filter(
      (order) =>
        order.priority ||
        Date.parse(order.dueAt) <= Date.parse(input.horizonEnd),
    )
    .slice()
    .sort(compareOrders(input));
  const oversized =
    pulseCapacityLbs > 0
      ? candidates.filter((order) => order.derivedWeightLbs > pulseCapacityLbs)
      : candidates;
  const placeable = candidates.filter(
    (order) =>
      pulseCapacityLbs > 0 && order.derivedWeightLbs <= pulseCapacityLbs,
  );

  if (oversized.length > 0)
    warnings.push({
      code: 'OVERSIZED_ORDER',
      message: 'One or more whole orders exceed pulse capacity.',
      blocking: false,
      orderIds: oversized.map((order) => order.id).sort(),
    });

  const batches: readonly SchedulingBatch[] = packOrders(
    placeable,
    pulseCapacityLbs,
  ).map((batch, sequence) => ({
    sequence,
    orderIds: batch.orders.map((order) => order.id),
    derivedWeightLbs: batch.weightLbs,
    bagCount: batch.orders.reduce((total, order) => total + order.bagCount, 0),
    stages: buildStages(input, sequence, batch.weightLbs),
  }));
  const makespanMinutes =
    batches.length === 0
      ? 0
      : (batches.length + stages.length - 1) * input.config.pulseMinutes;
  const plannedCompletionAt = addMinutes(input.shift.startsAt, makespanMinutes);

  if (Date.parse(plannedCompletionAt) > Date.parse(input.shift.endsAt))
    warnings.push({
      code: 'SHIFT_OVERFLOW',
      message: 'The proposed schedule completes after the configured shift.',
      blocking: true,
    });

  const output = {
    algorithmVersion: input.config.algorithmVersion,
    pulseMinutes: input.config.pulseMinutes,
    pulseCapacityLbs,
    batchCount: batches.length,
    makespanMinutes,
    plannedCompletionAt,
    batches,
    unplacedOrderIds: oversized.map((order) => order.id).sort(),
    warnings: warnings
      .slice()
      .sort((left, right) => left.code.localeCompare(right.code)),
  };
  const canonicalOutput = canonicalJson(output);

  return {
    ...output,
    inputSnapshotHash,
    outputPlanHash: sha256(canonicalOutput),
    canonicalOutput,
  };
};
