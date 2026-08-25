import { createShiftWindowInvalid } from './failures.ts';
import type {
  CreateShiftCommand,
  CreateShiftDecision,
  CreateShiftPolicy,
} from './types.ts';

export const createShiftOperationId = 'production.create-shift.v1' as const;

export const decideCreateShift = (input: {
  command: CreateShiftCommand;
  policy: CreateShiftPolicy;
}): CreateShiftDecision => {
  if (
    !Number.isFinite(Date.parse(input.command.startsAt)) ||
    !Number.isFinite(Date.parse(input.command.endsAt)) ||
    Date.parse(input.command.endsAt) <= Date.parse(input.command.startsAt)
  )
    return { kind: 'reject', failure: createShiftWindowInvalid() };

  return {
    kind: 'create',
    shift: {
      locationId: input.command.locationId,
      startsAt: input.command.startsAt,
      endsAt: input.command.endsAt,
      timezone: input.command.timezone,
      effectiveFolderCount: input.command.effectiveFolderCount,
      status: input.policy.initialProductionShiftState,
      version: 1,
    },
  };
};
