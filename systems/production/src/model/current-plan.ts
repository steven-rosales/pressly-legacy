import * as result from '@pressly/cells/result';
import type { CodedFailure, Result } from '@pressly/cells/result';

export type CurrentPlanAcceptanceInput = Readonly<{
  scheduleRunId: string;
  currentScheduleRunId: string | null;
  eligibleOrderSnapshotMatches: boolean;
}>;

export const evaluateCurrentPlanAcceptance = (
  input: CurrentPlanAcceptanceInput,
): Result<Readonly<{ current: true }>, CodedFailure> => {
  if (input.currentScheduleRunId !== input.scheduleRunId)
    return result.err({
      code: 'SCHEDULE_NOT_CURRENT',
      message: 'A superseded schedule revision cannot be accepted.',
    });

  if (!input.eligibleOrderSnapshotMatches)
    return result.err({
      code: 'SCHEDULE_INPUT_SNAPSHOT_STALE',
      message: 'Eligible production work changed after this plan was computed.',
    });

  return result.ok({ current: true });
};
