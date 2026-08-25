import { describe, expect, it } from 'vitest';
import {
  emptyHistoryRunStatistics,
  projectHistoryActivity,
  projectHistoryMembership,
  projectHistoryPlan,
  projectHistoryRun,
  projectHistoryRunDetailResult,
} from './project.ts';
import type { HistoryRunDetail } from './types.ts';

const id = (suffix: number): string =>
  `63000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const at = new Date('2026-08-22T15:00:00.000Z');

describe('load history run projections', () => {
  it('validates run, plan, membership, and sanitized activity vocabulary', () => {
    expect(
      projectHistoryRun(
        {
          id: id(1),
          productionShiftId: id(2),
          scheduleRunId: id(3),
          status: 'started',
          shiftStartsAt: at,
          shiftEndsAt: at,
          timezone: 'UTC',
          startedAt: at,
          completedAt: null,
          plannedCompletionAt: at,
          queueVersion: 1,
          overtimeAcknowledgedAt: null,
          createdAt: at,
        },
        emptyHistoryRunStatistics(),
      ),
    ).toMatchObject({ status: 'started', overtimeAcknowledged: false });
    expect(
      projectHistoryPlan({
        id: id(3),
        productionShiftId: id(2),
        linkedProductionRunId: id(1),
        status: 'accepted',
        shiftStartsAt: at,
        shiftEndsAt: at,
        algorithmVersion: 'fixed-pulse-ffd-v2',
        schedulerConfigId: id(4),
        inputSnapshotHash: 'a'.repeat(64),
        outputPlanHash: 'b'.repeat(64),
        pulseCapacityLbs: 100,
        batchCount: 1,
        makespanMinutes: 224,
        plannedCompletionAt: at,
        warnings: [{ code: 'SHIFT_OVERFLOW' }],
        acknowledgedWarningCodes: ['SHIFT_OVERFLOW'],
        createdAt: at,
        acceptedAt: at,
        acceptedBy: id(5),
        supersededAt: null,
      }),
    ).toMatchObject({ warningCount: 1, acknowledgedWarningCount: 1 });
    expect(
      projectHistoryMembership({
        membershipId: id(6),
        productionOrderId: id(7),
        externalOrderId: 'ORDER-1',
        orderStatus: 'scheduled',
        derivedWeightLbs: 20,
        bagCount: 1,
        productionBatchId: id(8),
        batchSequence: 0,
        placementProvenance: 'initial_schedule',
        active: false,
        placedAt: at,
        placedBy: id(5),
        releasedAt: at,
        releasedBy: id(5),
        releaseReason: 'needs_more_drying',
      }),
    ).toMatchObject({ placement: { state: 'released' } });
    expect(
      projectHistoryActivity(
        {
          id: id(9),
          eventType: 'production_run_started',
          entityType: 'production_run',
          entityId: id(1),
          actorId: id(5),
          actorDisplayName: '  Alex  ',
          expectedVersion: null,
          payload: {
            scheduleRunId: id(3),
            productionBatchIds: [id(8)],
            queueVersion: 1,
            _idempotency: { private: true },
          },
          createdAt: at,
        },
        id(1),
      ),
    ).toMatchObject({
      actor: { kind: 'user', displayName: 'Alex' },
      details: { kind: 'run', batchCount: 1, queueVersion: 1 },
    });
  });

  it('serializes every nested date and copies detail arrays', () => {
    const changedFields = ['startsAt'] as const;
    const detail: HistoryRunDetail = {
      overview: {
        productionRunId: id(1),
        productionShiftId: id(2),
        scheduleRunId: id(3),
        status: 'started',
        shiftStartsAt: at,
        shiftEndsAt: at,
        timezone: 'UTC',
        startedAt: at,
        completedAt: null,
        plannedCompletionAt: at,
        ...emptyHistoryRunStatistics(),
        queueVersion: 1,
        overtimeAcknowledged: false,
        createdAt: at,
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
            shiftStartsAt: at,
            shiftEndsAt: at,
            algorithmVersion: 'fixed-pulse-ffd-v2',
            schedulerConfigId: id(4),
            inputSnapshotHash: 'a'.repeat(64),
            outputPlanHash: 'b'.repeat(64),
            pulseCapacityLbs: 100,
            batchCount: 0,
            makespanMinutes: 0,
            plannedCompletionAt: at,
            warningCount: 0,
            acknowledgedWarningCount: 0,
            createdAt: at,
            acceptedAt: at,
            acceptedBy: id(5),
            supersededAt: null,
          },
        ],
      },
      activity: {
        items: [
          {
            id: id(9),
            eventType: 'production_shift_updated',
            entityType: 'production_shift',
            entityId: id(2),
            actor: { id: id(5), kind: 'user', displayName: 'Alex' },
            expectedVersion: 1,
            productionRunId: id(1),
            resolutionAction: null,
            summary: 'Production shift updated',
            details: {
              kind: 'shift',
              changedFields,
              supersededScheduleRunId: null,
            },
            occurredAt: at,
          },
        ],
        hasMore: false,
      },
      asOf: at,
    };
    const projected = projectHistoryRunDetailResult(detail);
    expect(projected).toMatchObject({
      overview: { startedAt: at.toISOString() },
      scheduleLineage: {
        revisions: [{ createdAt: at.toISOString() }],
      },
      activity: { items: [{ occurredAt: at.toISOString() }] },
      asOf: at.toISOString(),
    });
    expect(
      (projected.activity.items[0]?.details as { changedFields: string[] })
        .changedFields,
    ).not.toBe(changedFields);
  });
});
