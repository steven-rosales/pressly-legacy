import { describe, expect, it } from 'vitest';
import {
  emptyHistoryRunStatistics,
  projectHistoryRun,
  projectHistoryRunsResult,
} from './project.ts';

const row = {
  id: '10000000-0000-4000-8000-000000000001',
  productionShiftId: '10000000-0000-4000-8000-000000000002',
  scheduleRunId: '10000000-0000-4000-8000-000000000003',
  status: 'completed',
  shiftStartsAt: new Date('2026-08-21T08:00:00.000Z'),
  shiftEndsAt: new Date('2026-08-21T16:00:00.000Z'),
  timezone: 'America/New_York',
  startedAt: new Date('2026-08-21T08:00:00.000Z'),
  completedAt: new Date('2026-08-21T15:00:00.000Z'),
  plannedCompletionAt: new Date('2026-08-21T14:00:00.000Z'),
  queueVersion: 2,
  overtimeAcknowledgedAt: null,
  createdAt: new Date('2026-08-21T07:00:00.000Z'),
} as const;

describe('list-history-runs projection', () => {
  it('combines run facts with same-snapshot aggregates', () => {
    const run = projectHistoryRun(row, {
      batchCount: 2,
      completedBatchCount: 1,
      orderCount: 4,
      priorityOrderCount: 2,
      totalWeightLbs: 80,
    });
    expect(
      projectHistoryRunsResult({
        items: [run],
        nextCursor: null,
        asOf: new Date('2026-08-21T16:00:00.000Z'),
      }),
    ).toMatchObject({
      items: [
        {
          productionRunId: row.id,
          status: 'completed',
          batchCount: 2,
          orderCount: 4,
          startedAt: '2026-08-21T08:00:00.000Z',
        },
      ],
      asOf: '2026-08-21T16:00:00.000Z',
    });
  });

  it('uses zero aggregates and rejects missing start truth', () => {
    expect(emptyHistoryRunStatistics()).toEqual({
      batchCount: 0,
      completedBatchCount: 0,
      orderCount: 0,
      priorityOrderCount: 0,
      totalWeightLbs: 0,
    });
    expect(() =>
      projectHistoryRun(
        { ...row, startedAt: null },
        emptyHistoryRunStatistics(),
      ),
    ).toThrow(
      expect.objectContaining({ code: 'production_history_run_start_missing' }),
    );
  });
});
