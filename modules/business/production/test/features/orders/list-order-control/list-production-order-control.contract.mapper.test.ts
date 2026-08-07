import { describe, expect, it } from 'vitest';
import {
  toListProductionOrderControlResult,
  toProductionOrderControlListItem,
} from '../../../../src/features/orders/list-order-control/list-production-order-control.contract.mapper.ts';
import { productionOrderControlCursor } from '../../../../src/features/orders/list-order-control/production-order-control-cursor.value.ts';

const orderId = '10000000-0000-4000-8000-000000000001';

describe('production order-control cursor', () => {
  it('serializes the shared order read model at the order-control edge', () => {
    expect(
      toProductionOrderControlListItem({
        id: orderId,
        locationId: 'location-a',
        externalOrderId: 'C-1001',
        dueAt: new Date('2026-07-12T20:00:00.000Z'),
        dueBucket: 'today',
        priority: false,
        status: 'intake_pending',
        derivedWeightLbs: 74,
        bagCount: null,
        bagCountProvenance: null,
        intakeVersion: null,
        version: 1,
      }),
    ).toMatchObject({ dueAt: '2026-07-12T20:00:00.000Z' });
  });

  it('binds the keyset position to the complete server filter', () => {
    const activeFilter = {
      locationId: 'location-a',
      view: 'active',
      dueBucket: 'overdue',
      priority: true,
      limit: 25,
    } as const;
    const point = {
      dueAt: new Date('2026-07-15T20:00:00.000Z'),
      id: orderId,
    };
    const cursor = productionOrderControlCursor.encode(activeFilter, point);

    expect(productionOrderControlCursor.decode(cursor, activeFilter)).toEqual(
      point,
    );
    expect(
      productionOrderControlCursor.decode(cursor, {
        locationId: 'location-a',
        view: 'active',
        dueBucket: 'today',
        priority: false,
        limit: 25,
      }),
    ).toBeNull();
  });

  it('serializes nested read-model timestamps only at the HTTP edge', () => {
    const assignedAt = new Date('2026-07-15T18:00:00.000Z');
    const pinnedAt = new Date('2026-07-15T17:00:00.000Z');
    const asOf = new Date('2026-07-15T19:00:00.000Z');
    const wire = toListProductionOrderControlResult({
      items: [
        {
          order: {
            id: orderId,
            locationId: 'location-a',
            externalOrderId: 'C-1001',
            dueAt: new Date('2026-07-15T20:00:00.000Z'),
            dueBucket: 'today',
            priority: true,
            status: 'scheduled',
            derivedWeightLbs: 25,
            bagCount: 1,
            bagCountProvenance: 'operator_intake',
            intakeVersion: 1,
            version: 3,
          },
          admission: {
            sourceState: 'released',
            override: null,
            effectiveState: 'released',
            allowedActions: [],
          },
          attention: null,
          currentPlacement: {
            productionRunId: '10000000-0000-4000-8000-000000000002',
            productionBatchId: '10000000-0000-4000-8000-000000000003',
            batchSequence: 0,
            batchStatus: 'sorting',
            batchVersion: 2,
            queueVersion: 4,
            membershipFrozen: true,
            placementProvenance: 'manager_exact',
            pinnedAt,
            pinnedBy: '10000000-0000-4000-8000-000000000004',
          },
          nextRequiredStage: 'sorting',
          routeAttempts: [
            {
              id: '10000000-0000-4000-8000-000000000005',
              productionRunId: '10000000-0000-4000-8000-000000000002',
              stageRunId: '10000000-0000-4000-8000-000000000006',
              productionBatchId: '10000000-0000-4000-8000-000000000003',
              batchSequence: 0,
              batchStatus: 'sorting',
              stage: 'sorting',
              stageStatus: 'started',
              attemptNumber: 1,
              status: 'assigned',
              assignmentReason: 'initial_schedule',
              assignedAt,
              assignedBy: null,
              completedAt: null,
              completedBy: null,
              releasedAt: null,
              releasedBy: null,
              releaseReason: null,
            },
          ],
          commands: {
            queuedMove: {
              status: 'blocked',
              code: 'SOURCE_BATCH_WOULD_BE_EMPTY',
              targets: [],
            },
            routeException: {
              status: 'blocked',
              code: 'SOURCE_BATCH_WOULD_BE_EMPTY',
            },
          },
          resolutionAction: {
            status: 'blocked',
            reasons: ['execution_committed'],
          },
        },
      ],
      counts: { attention: 0, active: 1, all: 1 },
      nextCursor: null,
      asOf,
    });

    expect(wire.asOf).toBe(asOf.toISOString());
    expect(wire.items[0]?.currentPlacement?.pinnedAt).toBe(
      pinnedAt.toISOString(),
    );
    expect(wire.items[0]?.routeAttempts[0]?.assignedAt).toBe(
      assignedAt.toISOString(),
    );
  });
});
