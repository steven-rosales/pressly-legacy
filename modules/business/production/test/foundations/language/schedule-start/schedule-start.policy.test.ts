import { describe, expect, it } from 'vitest';
import { evaluateScheduleStart } from '../../../../src/foundations/language/schedule-start/schedule-start.policy.ts';

const valid = {
  scheduleRunId: 'schedule-2',
  status: 'accepted',
  currentScheduleRunId: 'schedule-2',
  eligibleOrderSnapshotMatches: true,
  productionRunExists: false,
  batchCount: 2,
} as const;

describe('schedule start policy', () => {
  it('starts the current accepted plan exactly once', () => {
    expect(evaluateScheduleStart(valid)).toEqual({
      tag: 'ok',
      value: { started: true },
    });
  });

  it.each([
    [{ ...valid, status: 'draft' }, 'SCHEDULE_NOT_ACCEPTED'],
    [{ ...valid, currentScheduleRunId: 'schedule-3' }, 'SCHEDULE_NOT_CURRENT'],
    [
      { ...valid, eligibleOrderSnapshotMatches: false },
      'SCHEDULE_INPUT_SNAPSHOT_STALE',
    ],
    [{ ...valid, productionRunExists: true }, 'PRODUCTION_RUN_ALREADY_EXISTS'],
    [{ ...valid, batchCount: 0 }, 'SCHEDULE_HAS_NO_BATCHES'],
  ] as const)('rejects an invalid start commitment', (candidate, code) => {
    expect(evaluateScheduleStart(candidate)).toMatchObject({
      tag: 'err',
      error: { code },
    });
  });
});
