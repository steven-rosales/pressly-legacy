import { describe, expect, it } from 'vitest';
import { evaluateCurrentPlanAcceptance } from '../../src/current-plan/current-plan.policy.ts';

const valid = {
  scheduleRunId: 'schedule-2',
  currentScheduleRunId: 'schedule-2',
  eligibleOrderSnapshotMatches: true,
} as const;

describe('current schedule plan policy', () => {
  it('allows the current revision with an exact eligible-order snapshot', () => {
    expect(evaluateCurrentPlanAcceptance(valid)).toEqual({
      tag: 'ok',
      value: { current: true },
    });
  });

  it.each([
    [{ ...valid, currentScheduleRunId: 'schedule-3' }, 'SCHEDULE_NOT_CURRENT'],
    [
      { ...valid, eligibleOrderSnapshotMatches: false },
      'SCHEDULE_INPUT_SNAPSHOT_STALE',
    ],
  ] as const)('rejects an invalid current-plan guard', (candidate, code) => {
    expect(evaluateCurrentPlanAcceptance(candidate)).toMatchObject({
      tag: 'err',
      error: { code },
    });
  });
});
