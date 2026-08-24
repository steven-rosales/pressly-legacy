import { proveOperation } from '@pressly/testkit/operation-proof';
import { loadHistoryRunCellDeclaration } from './cell.ts';
import type { ProductionHistoryRunDetail } from '../../../read-models/production-history/contract.ts';
import { describe, expect, it } from 'vitest';
import { loadHistoryRunContract } from './contract.ts';

const id = (suffix: number): string =>
  `61000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const detail: ProductionHistoryRunDetail = {
  overview: {
    productionRunId: id(1),
    productionShiftId: id(2),
    scheduleRunId: id(3),
    status: 'started',
    shiftStartsAt: '2026-08-22T14:00:00.000Z',
    shiftEndsAt: '2026-08-22T22:00:00.000Z',
    timezone: 'America/New_York',
    startedAt: '2026-08-22T14:00:00.000Z',
    completedAt: null,
    plannedCompletionAt: '2026-08-22T20:00:00.000Z',
    batchCount: 0,
    completedBatchCount: 0,
    orderCount: 0,
    priorityOrderCount: 0,
    totalWeightLbs: 0,
    queueVersion: 1,
    overtimeAcknowledged: false,
    createdAt: '2026-08-22T14:00:00.000Z',
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
        shiftStartsAt: '2026-08-22T14:00:00.000Z',
        shiftEndsAt: '2026-08-22T22:00:00.000Z',
        algorithmVersion: 'fixed-pulse-ffd-v2',
        schedulerConfigId: id(4),
        inputSnapshotHash: 'a'.repeat(64),
        outputPlanHash: 'b'.repeat(64),
        pulseCapacityLbs: 100,
        batchCount: 0,
        makespanMinutes: 0,
        plannedCompletionAt: '2026-08-22T20:00:00.000Z',
        warningCount: 0,
        acknowledgedWarningCount: 0,
        createdAt: '2026-08-22T13:00:00.000Z',
        acceptedAt: '2026-08-22T13:30:00.000Z',
        acceptedBy: id(5),
        supersededAt: null,
      },
    ],
  },
  activity: { items: [], hasMore: false },
  asOf: '2026-08-22T15:00:00.000Z',
};

describe('load history run contract', () => {
  proveOperation({
    operationId: 'production.load-history-run.v1',
    declaration: loadHistoryRunCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'accepts only strict location and run identity',
        proves: ['contract'],
        run: () => {
          const input = { locationId: 'location-1', productionRunId: id(1) };
          expect(loadHistoryRunContract.input.decode(input)).toEqual({
            kind: 'valid',
            value: input,
          });
          expect(
            loadHistoryRunContract.input.decode({ ...input, orderId: id(9) }),
          ).toMatchObject({ kind: 'invalid' });
          expect(
            loadHistoryRunContract.input.decode({
              locationId: '',
              productionRunId: 'not-a-run',
            }),
          ).toMatchObject({ kind: 'invalid' });
        },
      },
    ],
  });

  it('round-trips the complete nested v1 DTO', () => {
    const encoded = loadHistoryRunContract.output.encode(detail);
    expect(loadHistoryRunContract.output.decode(encoded)).toEqual({
      kind: 'valid',
      value: detail,
    });
  });

  it('keeps location and run absence distinct', () => {
    expect(
      loadHistoryRunContract.failure.decode({
        tag: 'ProductionFailure',
        kind: 'not_found',
        code: 'production_location_not_found',
      }),
    ).toMatchObject({
      kind: 'valid',
      value: { code: 'production_location_not_found' },
    });
    expect(
      loadHistoryRunContract.failure.decode({
        tag: 'ProductionFailure',
        kind: 'not_found',
        code: 'production_history_run_not_found',
      }),
    ).toMatchObject({
      kind: 'valid',
      value: { code: 'production_history_run_not_found' },
    });
  });
});
