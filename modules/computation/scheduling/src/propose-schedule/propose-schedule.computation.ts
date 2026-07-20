import { createHash } from 'node:crypto';
import {
  addMinutes,
  fixedPulseMakespanMinutes,
  fixedPulseStages,
  packFixedPulseItems,
  pulseCapacity,
  sortFixedPulseItems,
} from '../fixed-pulse/fixed-pulse.computation.ts';
import type {
  ProposedStage,
  ProposeSchedule,
  SchedulingBatch,
  SchedulingMachine,
  SchedulingWarning,
} from './propose-schedule.port.ts';

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

const buildFixedPulseStages = (
  input: Readonly<{
    startsAt: string;
    pulseMinutes: number;
    batchSequence: number;
    batchWeightLbs: number;
    machines: readonly SchedulingMachine[];
  }>,
): readonly ProposedStage[] =>
  fixedPulseStages.map((stage, stageIndex) => {
    const offset = (input.batchSequence + stageIndex) * input.pulseMinutes;
    const startsAt = addMinutes(input.startsAt, offset);

    return {
      stage,
      startsAt,
      endsAt: addMinutes(startsAt, input.pulseMinutes),
      machineIds:
        stage === 'washing' || stage === 'drying'
          ? selectMachines(input.machines, stage, input.batchWeightLbs)
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
  const capacity = pulseCapacity({
    machines: input.machines,
    foldLbsPerFolderMinute: input.config.foldLbsPerFolderMinute,
    effectiveFolderCount: input.shift.effectiveFolderCount,
    pulseMinutes: input.config.pulseMinutes,
  });
  const { pulseCapacityLbs } = capacity;
  const warnings = capacityWarnings(
    capacity.washerCapacityLbs,
    capacity.dryerCapacityLbs,
    capacity.foldingCapacityLbs,
  );
  const candidates = sortFixedPulseItems(
    input.orders.map((order) => ({
      id: order.id,
      dueAt: order.dueAt,
      priority: order.priority,
      weightLbs: order.derivedWeightLbs,
      value: order,
    })),
    input.shift,
  );
  const oversized =
    pulseCapacityLbs > 0
      ? candidates.filter((order) => order.weightLbs > pulseCapacityLbs)
      : candidates;
  const placeable = candidates.filter(
    (order) => pulseCapacityLbs > 0 && order.weightLbs <= pulseCapacityLbs,
  );

  if (oversized.length > 0)
    warnings.push({
      code: 'OVERSIZED_ORDER',
      message: 'One or more whole orders exceed pulse capacity.',
      blocking: false,
      orderIds: oversized.map((order) => order.id).sort(),
    });

  const batches: readonly SchedulingBatch[] = packFixedPulseItems(
    placeable,
    pulseCapacityLbs,
  ).map((batch, sequence) => ({
    sequence,
    orderIds: batch.items.map((order) => order.id),
    derivedWeightLbs: batch.weightLbs,
    bagCount: batch.items.reduce(
      (total, order) => total + order.value.bagCount,
      0,
    ),
    stages: buildFixedPulseStages({
      startsAt: input.shift.startsAt,
      pulseMinutes: input.config.pulseMinutes,
      batchSequence: sequence,
      batchWeightLbs: batch.weightLbs,
      machines: input.machines,
    }),
  }));
  const makespanMinutes = fixedPulseMakespanMinutes(
    batches.length,
    input.config.pulseMinutes,
  );
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
