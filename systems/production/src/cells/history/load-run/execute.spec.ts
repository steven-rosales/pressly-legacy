import { proveOperation } from '@pressly/testkit/operation-proof';
import { loadHistoryRunCellDeclaration } from './cell.ts';
import { invariantViolationError } from '@pressly/errors/factories';
import { describe, expect, it, vi } from 'vitest';
import { makeExecuteLoadHistoryRun } from './execute.ts';
import type { HistoryRunDetail } from './types.ts';

const id = (suffix: number): string =>
  `62000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const now = new Date('2026-08-22T15:00:00.000Z');
const detail: HistoryRunDetail = {
  overview: {
    productionRunId: id(1),
    productionShiftId: id(2),
    scheduleRunId: id(3),
    status: 'started',
    shiftStartsAt: new Date('2026-08-22T14:00:00.000Z'),
    shiftEndsAt: new Date('2026-08-22T22:00:00.000Z'),
    timezone: 'America/New_York',
    startedAt: new Date('2026-08-22T14:00:00.000Z'),
    completedAt: null,
    plannedCompletionAt: new Date('2026-08-22T20:00:00.000Z'),
    batchCount: 0,
    completedBatchCount: 0,
    orderCount: 0,
    priorityOrderCount: 0,
    totalWeightLbs: 0,
    queueVersion: 1,
    overtimeAcknowledged: false,
    createdAt: new Date('2026-08-22T14:00:00.000Z'),
  },
  batches: [],
  orderMemberships: [],
  stageProgress: { planned: 0, started: 0, completed: 0, items: [] },
  scheduleLineage: {
    executionScheduleRunId: id(3),
    revisions: [
      {
        scheduleRunId: id(3),
        productionShiftId: id(2),
        linkedProductionRunId: id(1),
        status: 'accepted',
        shiftStartsAt: new Date('2026-08-22T14:00:00.000Z'),
        shiftEndsAt: new Date('2026-08-22T22:00:00.000Z'),
        algorithmVersion: 'fixed-pulse-ffd-v2',
        schedulerConfigId: id(4),
        inputSnapshotHash: 'a'.repeat(64),
        outputPlanHash: 'b'.repeat(64),
        pulseCapacityLbs: 100,
        batchCount: 0,
        makespanMinutes: 0,
        plannedCompletionAt: new Date('2026-08-22T20:00:00.000Z'),
        warningCount: 0,
        acknowledgedWarningCount: 0,
        createdAt: new Date('2026-08-22T13:00:00.000Z'),
        acceptedAt: new Date('2026-08-22T13:30:00.000Z'),
        acceptedBy: id(5),
        supersededAt: null,
      },
    ],
  },
  activity: { items: [], hasMore: false },
  asOf: now,
};
const input = { locationId: 'location-1', productionRunId: id(1) };

describe('execute load history run', () => {
  proveOperation({
    operationId: 'production.load-history-run.v1',
    declaration: loadHistoryRunCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'reads the clock once before opening the repository snapshot',
        proves: ['executor-success'],
        run: async () => {
          const trace: string[] = [];
          const clock = vi.fn(() => {
            trace.push('clock');
            return now;
          });
          const load = vi.fn(async (_input, asOf: Date) => {
            trace.push('read');
            expect(asOf).toBe(now);
            return { kind: 'found' as const, detail };
          });
          await expect(
            makeExecuteLoadHistoryRun({
              repo: { load },
              clock: { now: clock },
            })(input),
          ).resolves.toMatchObject({
            kind: 'success',
            value: { asOf: now.toISOString() },
          });
          expect(clock).toHaveBeenCalledOnce();
          expect(trace).toEqual(['clock', 'read']);
        },
      },
    ],
  });

  it.each([
    ['location_not_found', 'production_location_not_found'],
    ['run_not_found', 'production_history_run_not_found'],
  ] as const)('maps %s to %s', async (kind, code) => {
    const execute = makeExecuteLoadHistoryRun({
      repo: { load: async () => ({ kind }) },
      clock: { now: () => now },
    });
    await expect(execute(input)).resolves.toMatchObject({
      kind: 'failure',
      failure: { kind: 'not_found', code },
    });
  });

  it('preserves owned AppErrors and maps unknown read faults', async () => {
    const owned = invariantViolationError({
      code: 'owned_history_fault',
      message: 'owned',
      safeMessage: 'owned',
    });
    for (const [fault, code] of [
      [owned, 'owned_history_fault'],
      [{ fixture: true }, 'production_history_run_load_failed'],
    ] as const) {
      const execute = makeExecuteLoadHistoryRun({
        repo: {
          load: async () => {
            throw fault;
          },
        },
        clock: { now: () => now },
      });
      await expect(execute(input)).rejects.toMatchObject({ code });
    }
  });
});
