import { result, type Result } from '@pressly/kernel';

type Rejection = Readonly<{ code: string; message: string }>;

export type ScheduleStartInput = Readonly<{
  scheduleRunId: string;
  status: string;
  currentScheduleRunId: string | null;
  eligibleOrderSnapshotMatches: boolean;
  productionRunExists: boolean;
  batchCount: number;
}>;

export const evaluateScheduleStart = (
  input: ScheduleStartInput,
): Result<Readonly<{ started: true }>, Rejection> => {
  if (input.status !== 'accepted')
    return result.err({
      code: 'SCHEDULE_NOT_ACCEPTED',
      message: 'Only an accepted schedule may start production.',
    });

  if (input.currentScheduleRunId !== input.scheduleRunId)
    return result.err({
      code: 'SCHEDULE_NOT_CURRENT',
      message: 'Only the current accepted schedule may start production.',
    });

  if (!input.eligibleOrderSnapshotMatches)
    return result.err({
      code: 'SCHEDULE_INPUT_SNAPSHOT_STALE',
      message: 'Eligible production work changed after this plan was accepted.',
    });

  if (input.productionRunExists)
    return result.err({
      code: 'PRODUCTION_RUN_ALREADY_EXISTS',
      message: 'A production shift may have only one production run.',
    });

  if (!Number.isInteger(input.batchCount) || input.batchCount <= 0)
    return result.err({
      code: 'SCHEDULE_HAS_NO_BATCHES',
      message: 'An empty accepted schedule cannot start production.',
    });

  return result.ok({ started: true });
};
