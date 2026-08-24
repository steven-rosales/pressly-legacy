import { describe, expect, it } from 'vitest';
import {
  attentionFor,
  projectOrderControlResult,
  projectProductionOrder,
} from './project.ts';
import type {
  ListOrderControlResult,
  OrderControlPersistenceRow,
} from './types.ts';

const id = (suffix: number): string =>
  `67000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const asOf = new Date('2026-08-22T15:00:00.000Z');
const row: OrderControlPersistenceRow = {
  id: id(1),
  locationId: 'location-1',
  externalOrderId: 'ORDER-1',
  dueAt: new Date('2026-08-22T20:00:00.000Z'),
  priority: true,
  status: 'scheduled',
  derivedWeightLbs: 20,
  bagCount: 1,
  bagCountSource: 'operator_intake',
  intakeVersion: 1,
  intakeRecordedAt: asOf,
  version: 3,
  resolutionState: 'open',
  executionStatus: 'scheduled',
  pendingPlacement: null,
  admissionOverride: null,
  admissionState: 'released',
  productionBatchId: id(2),
  placementProvenance: 'initial_schedule',
  pinnedAt: null,
  pinnedBy: null,
  batchSequence: 0,
  batchStatus: 'queued',
  batchVersion: 2,
  membershipFrozenAt: null,
  productionRunId: id(3),
  productionRunStatus: 'started',
  queueVersion: 4,
  selectedForShift: false,
  resolutionHasShiftSelection: true,
  hasBatchMembership: true,
  hasStageAttempt: true,
  hasRoute: false,
};

describe('order control projections', () => {
  it('validates order persistence and derives local due/attention state', () => {
    const order = projectProductionOrder(row, asOf, 'America/New_York');
    expect(order).toMatchObject({
      dueBucket: 'today',
      bagCountProvenance: 'operator_intake',
      intakeVersion: 1,
    });
    expect(
      attentionFor(
        {
          ...order,
          status: 'intake_pending',
          bagCount: null,
          bagCountProvenance: null,
          intakeVersion: null,
        },
        null,
      ),
    ).toMatchObject({ reason: 'intake_required' });
    expect(
      attentionFor(
        { ...order, status: 'eligible' },
        { reason: 'queue_conflict' },
      ),
    ).toMatchObject({ reason: 'placement_conflict' });
  });

  it('serializes nested timestamps and copies nested capability data', () => {
    const assignedAt = new Date('2026-08-22T14:00:00.000Z');
    const result: ListOrderControlResult = {
      items: [
        {
          order: projectProductionOrder(row, asOf, 'America/New_York'),
          admission: {
            sourceState: 'released',
            override: null,
            effectiveState: 'released',
            allowedActions: [],
          },
          attention: null,
          currentPlacement: {
            productionRunId: id(3),
            productionBatchId: id(2),
            batchSequence: 0,
            batchStatus: 'queued',
            batchVersion: 2,
            queueVersion: 4,
            membershipFrozen: false,
            placementProvenance: 'initial_schedule',
            pinnedAt: null,
            pinnedBy: null,
          },
          nextRequiredStage: 'sorting',
          routeAttempts: [
            {
              id: id(4),
              productionRunId: id(3),
              stageRunId: id(5),
              productionBatchId: id(2),
              batchSequence: 0,
              batchStatus: 'queued',
              stage: 'sorting',
              stageStatus: 'planned',
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
    };
    const projected = projectOrderControlResult(result);
    expect(projected).toMatchObject({
      items: [
        {
          order: { dueAt: row.dueAt.toISOString() },
          routeAttempts: [{ assignedAt: assignedAt.toISOString() }],
        },
      ],
      asOf: asOf.toISOString(),
    });
    expect(projected.items[0]?.commands).not.toBe(result.items[0]?.commands);
  });
});
