import { describe, expect, it } from 'vitest';
import { evaluateCurrentPlanAcceptance } from '../../src/current-plan/current-plan.policy.ts';

const valid = {
  scheduleRunId: 'schedule-2',
  status: 'draft',
  currentScheduleRunId: 'schedule-2',
  eligibleOrderSnapshotMatches: true,
} as const;

describe('current schedule plan policy', () => {
  it('allows only the current draft with an exact eligible-order snapshot', () => {
    expect(evaluateCurrentPlanAcceptance(valid)).toEqual({
      tag: 'ok',
      value: { current: true },
    });
  });

  it.each([
    [{ ...valid, status: 'accepted' }, 'SCHEDULE_NOT_DRAFT'],
    [{ ...valid, currentScheduleRunId: 'schedule-3' }, 'SCHEDULE_NOT_CURRENT'],
    [
      { ...valid, eligibleOrderSnapshotMatches: false },
      'SCHEDULE_INPUT_SNAPSHOT_STALE',
    ],
  ] as const)('rejects a non-current acceptance', (candidate, code) => {
    expect(evaluateCurrentPlanAcceptance(candidate)).toMatchObject({
      tag: 'err',
      error: { code },
    });
  });
});
