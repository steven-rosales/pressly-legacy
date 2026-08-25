import { isAppError } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { projectHistoryPlan, projectHistoryPlansResult } from './project.ts';
import type { HistoryPlanPersistenceRow } from './types.ts';

const row = (status = 'accepted'): HistoryPlanPersistenceRow => ({
  id: '10000000-0000-4000-8000-000000000001',
  productionShiftId: '10000000-0000-4000-8000-000000000002',
  linkedProductionRunId: '10000000-0000-4000-8000-000000000003',
  status,
  shiftStartsAt: new Date('2026-08-21T12:00:00.000Z'),
  shiftEndsAt: new Date('2026-08-21T20:00:00.000Z'),
  algorithmVersion: 'fixed-pulse-ffd-v2',
  schedulerConfigId: '10000000-0000-4000-8000-000000000004',
  inputSnapshotHash: 'a'.repeat(64),
  outputPlanHash: 'b'.repeat(64),
  pulseCapacityLbs: 100,
  batchCount: 2,
  makespanMinutes: 112,
  plannedCompletionAt: new Date('2026-08-21T18:00:00.000Z'),
  warnings: [{ code: 'SHIFT_OVERFLOW' }],
  acknowledgedWarningCodes: ['SHIFT_OVERFLOW'],
  createdAt: new Date('2026-08-20T12:00:00.000Z'),
  acceptedAt: new Date('2026-08-20T13:00:00.000Z'),
  acceptedBy: '10000000-0000-4000-8000-000000000005',
  supersededAt: null,
});

describe('list-history-plans pure projection', () => {
  it('maps persistence values and serializes dates only at the result edge', () => {
    const plan = projectHistoryPlan(row());
    const asOf = new Date('2026-08-21T15:00:00.000Z');

    expect(plan).toMatchObject({
      scheduleRunId: '10000000-0000-4000-8000-000000000001',
      status: 'accepted',
      warningCount: 1,
      acknowledgedWarningCount: 1,
    });
    expect(plan.shiftStartsAt).toBeInstanceOf(Date);
    expect(
      projectHistoryPlansResult({ items: [plan], nextCursor: null, asOf }),
    ).toMatchObject({
      items: [
        {
          shiftStartsAt: '2026-08-21T12:00:00.000Z',
          shiftEndsAt: '2026-08-21T20:00:00.000Z',
          acceptedAt: '2026-08-20T13:00:00.000Z',
          supersededAt: null,
        },
      ],
      asOf: '2026-08-21T15:00:00.000Z',
    });
  });

  it('treats malformed JSON arrays as empty like the current projection', () => {
    const plan = projectHistoryPlan({
      ...row('draft'),
      warnings: { not: 'an array' },
      acknowledgedWarningCodes: null,
      acceptedAt: null,
      acceptedBy: null,
    });

    expect(plan.warningCount).toBe(0);
    expect(plan.acknowledgedWarningCount).toBe(0);
  });

  it('rejects an unknown persisted status as an invariant violation', () => {
    try {
      projectHistoryPlan(row('unknown'));
      expect.unreachable('unknown history status should throw');
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      if (isAppError(error))
        expect(error).toMatchObject({
          code: 'production_history_schedule_status_invalid',
          safeMessage: 'Production state is inconsistent.',
          status: 500,
        });
    }
  });
});
