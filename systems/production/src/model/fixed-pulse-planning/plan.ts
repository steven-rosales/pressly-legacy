import {
  fixedPulseStages,
  type FixedPulseBatch,
  type FixedPulseCapacityMachine,
  type FixedPulseItem,
  type FixedPulseMachine,
  type FixedPulseStage,
} from './model.ts';

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

const dueBucket = (
  dueAt: string,
  shiftStartsAt: string,
  timezone: string,
): number => {
  const shiftDay = dayNumber(localDate(shiftStartsAt, timezone));
  const dueDay = dayNumber(localDate(dueAt, timezone));
  const distance = dueDay - shiftDay;

  return distance <= 0 ? 0 : distance === 1 ? 1 : 2;
};

export const sortFixedPulseItems = <Value>(
  items: readonly FixedPulseItem<Value>[],
  shift: Readonly<{ startsAt: string; timezone: string }>,
): readonly FixedPulseItem<Value>[] =>
  items
    .slice()
    .sort(
      (left, right) =>
        Number(right.priority) - Number(left.priority) ||
        dueBucket(left.dueAt, shift.startsAt, shift.timezone) -
          dueBucket(right.dueAt, shift.startsAt, shift.timezone) ||
        right.weightLbs - left.weightLbs ||
        Date.parse(left.dueAt) - Date.parse(right.dueAt) ||
        left.id.localeCompare(right.id),
    );

export const fleetCapacity = (
  machines: readonly FixedPulseCapacityMachine[],
  kind: FixedPulseCapacityMachine['stationKind'],
): number =>
  machines
    .filter((machine) => machine.active && machine.stationKind === kind)
    .reduce((total, machine) => total + machine.effectiveCapacityLbs, 0);

export const pulseCapacity = (input: {
  machines: readonly FixedPulseCapacityMachine[];
  foldLbsPerFolderMinute: number;
  effectiveFolderCount: number;
  pulseMinutes: number;
}): Readonly<{
  washerCapacityLbs: number;
  dryerCapacityLbs: number;
  foldingCapacityLbs: number;
  pulseCapacityLbs: number;
}> => {
  const washerCapacityLbs = fleetCapacity(input.machines, 'washing');
  const dryerCapacityLbs = fleetCapacity(input.machines, 'drying');
  const foldingCapacityLbs =
    input.foldLbsPerFolderMinute *
    input.effectiveFolderCount *
    input.pulseMinutes;

  return {
    washerCapacityLbs,
    dryerCapacityLbs,
    foldingCapacityLbs,
    pulseCapacityLbs: Math.min(
      washerCapacityLbs,
      dryerCapacityLbs,
      foldingCapacityLbs,
    ),
  };
};

export const packFixedPulseItems = <Value>(
  items: readonly FixedPulseItem<Value>[],
  capacityLbs: number,
): readonly FixedPulseBatch<Value>[] => {
  const batches: Array<{
    items: FixedPulseItem<Value>[];
    weightLbs: number;
  }> = [];

  for (const item of items) {
    const target = batches.find(
      (batch) => batch.weightLbs + item.weightLbs <= capacityLbs,
    );
    if (target === undefined) {
      batches.push({ items: [item], weightLbs: item.weightLbs });
      continue;
    }
    target.items.push(item);
    target.weightLbs += item.weightLbs;
  }

  return batches;
};

export const fixedPulseMakespanMinutes = (
  batchCount: number,
  pulseMinutes: number,
): number =>
  batchCount === 0
    ? 0
    : (batchCount + fixedPulseStages.length - 1) * pulseMinutes;

export const addMinutes = (instant: string, minutes: number): string =>
  new Date(Date.parse(instant) + minutes * 60_000).toISOString();

export const selectCapacityOrderedMachineIds = (
  machines: readonly FixedPulseMachine[],
  kind: FixedPulseMachine['stationKind'],
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

export const buildFixedPulseStages = (
  input: Readonly<{
    startsAt: string;
    pulseMinutes: number;
    batchSequence: number;
    batchWeightLbs: number;
    machines: readonly FixedPulseMachine[];
  }>,
): readonly FixedPulseStage[] =>
  fixedPulseStages.map((stage, stageIndex) => {
    const offset = (input.batchSequence + stageIndex) * input.pulseMinutes;
    const startsAt = addMinutes(input.startsAt, offset);

    return {
      stage,
      startsAt,
      endsAt: addMinutes(startsAt, input.pulseMinutes),
      machineIds:
        stage === 'washing' || stage === 'drying'
          ? selectCapacityOrderedMachineIds(
              input.machines,
              stage,
              input.batchWeightLbs,
            )
          : [],
    };
  });
