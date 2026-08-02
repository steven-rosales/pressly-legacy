import { result, type CodedFailure, type Result } from '@pressly/kernel';

type ShiftPlanningAction = 'compute' | 'accept' | 'start';

export type ShiftPlanningWindowInput = Readonly<{
  action: ShiftPlanningAction;
  now: Date;
  startsAt: Date;
  endsAt: Date;
}>;

export const evaluateShiftPlanningWindow = (
  input: ShiftPlanningWindowInput,
): Result<Readonly<{ allowed: true }>, CodedFailure> => {
  const now = input.now.getTime();
  const startsAt = input.startsAt.getTime();
  const endsAt = input.endsAt.getTime();

  if (
    !Number.isFinite(now) ||
    !Number.isFinite(startsAt) ||
    !Number.isFinite(endsAt) ||
    startsAt >= endsAt
  )
    return result.err({
      code: 'PRODUCTION_SHIFT_WINDOW_INVALID',
      message: 'The production shift has an invalid operating window.',
    });

  if (now >= endsAt)
    return result.err({
      code: 'PRODUCTION_SHIFT_EXPIRED',
      message: 'This production shift has ended. Create a current shift first.',
    });

  if (input.action === 'start' && now < startsAt)
    return result.err({
      code: 'PRODUCTION_SHIFT_NOT_STARTED',
      message: 'Production cannot start before the shift begins.',
    });

  return result.ok({ allowed: true });
};
