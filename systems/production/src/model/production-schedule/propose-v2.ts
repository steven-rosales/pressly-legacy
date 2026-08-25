import { canonicalJson } from '@pressly/codec';
import { canonicalSha256 } from '@pressly/codec/node';
import {
  addMinutes,
  buildFixedPulseStages,
  fixedPulseMakespanMinutes,
  packFixedPulseItems,
  pulseCapacity,
  sortFixedPulseItems,
} from '../fixed-pulse-planning/plan.ts';
import type {
  ProposeSchedule,
  ProposedScheduleBatch,
  ScheduleWarning,
} from './model.ts';

const capacityWarnings = (
  washerCapacity: number,
  dryerCapacity: number,
  foldingCapacity: number,
): ScheduleWarning[] => [
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

export const proposeFixedPulseScheduleV2: ProposeSchedule = (input) => {
  const inputSnapshotHash = canonicalSha256(input);
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

  const batches: readonly ProposedScheduleBatch[] = packFixedPulseItems(
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
    outputPlanHash: canonicalSha256(output),
    canonicalOutput,
  };
};
