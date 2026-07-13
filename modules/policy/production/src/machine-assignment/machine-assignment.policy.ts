import { result, type Result } from '@pressly/kernel';

type Rejection = Readonly<{ code: string; message: string }>;

export const evaluateMachineAssignment = (input: {
  stageKind: string;
  batchWeightLbs: number;
  machines: readonly Readonly<{
    id: string;
    stationKind: string;
    effectiveCapacityLbs: number;
    active: boolean;
    overlaps: boolean;
  }>[];
}): Result<Readonly<{ machineIds: readonly string[] }>, Rejection> => {
  if (!['washing', 'drying'].includes(input.stageKind))
    return input.machines.length === 0
      ? result.ok({ machineIds: [] })
      : result.err({
          code: 'MACHINE_NOT_ALLOWED_FOR_STAGE',
          message: 'This stage does not use physical machine assignments.',
        });

  const unique = new Set(input.machines.map((machine) => machine.id));

  if (unique.size !== input.machines.length)
    return result.err({
      code: 'MACHINE_ASSIGNED_TWICE',
      message: 'A machine may be assigned only once to a stage.',
    });

  if (
    input.machines.some(
      (machine) =>
        !machine.active ||
        machine.overlaps ||
        machine.stationKind !== input.stageKind,
    )
  )
    return result.err({
      code: 'MACHINE_UNAVAILABLE',
      message: 'Every assigned machine must be active, compatible, and free.',
    });

  const capacity = input.machines.reduce(
    (total, machine) => total + machine.effectiveCapacityLbs,
    0,
  );

  return capacity >= input.batchWeightLbs
    ? result.ok({ machineIds: [...unique].sort() })
    : result.err({
        code: 'MACHINE_CAPACITY_INSUFFICIENT',
        message: 'Assigned machines do not cover the batch weight.',
      });
};
