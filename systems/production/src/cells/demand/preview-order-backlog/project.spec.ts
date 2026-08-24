import { describe, expect, it } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { productionOrderBacklogCursor } from '../../../read-models/production-order-backlog/cursor.ts';
import type {
  ProductionOrderBacklogScope,
  ProductionOrderBacklogSnapshotOrder,
} from '../../../read-models/production-order-backlog/model.ts';
import { classifyProductionOrderBacklogSnapshot } from '../../../read-models/production-order-backlog/project.ts';
import { projectPreviewOrderBacklog } from './project.ts';

const scope: ProductionOrderBacklogScope = {
  locationId: 'location-1',
  filter: 'all_due_before_cutoff',
  cutoff: '2026-08-01T00:00:00.000Z',
  reason: 'processor_not_in_use',
  cursor: null,
  maxOrders: 1,
};
const snapshot: ProductionOrderBacklogSnapshotOrder = {
  orderId: '72000000-0000-4000-8000-000000000001',
  locationId: scope.locationId,
  displayReference: 'ORDER-1',
  dueAt: new Date('2026-07-01T12:00:00.000Z'),
  productionVersion: 1,
  resolutionState: 'open',
  executionStatus: 'unassigned',
  operationalStatus: 'release_pending',
  hasIntake: false,
  hasManualAdmission: false,
  isPriority: false,
  hasPendingPlacement: false,
  hasShiftSelection: false,
  hasBatchMembership: false,
  hasStageAttempt: false,
  hasRoute: false,
};

describe('preview order backlog result projection', () => {
  it('retains generatedAt, grouping, next cursor, and canonical preview hash', () => {
    const classified = classifyProductionOrderBacklogSnapshot(productionRules, {
      orders: [snapshot],
      hasMore: true,
    });
    const projected = projectPreviewOrderBacklog({
      request: scope,
      classified,
      generatedAt: new Date('2026-08-22T15:00:00.000Z'),
      cursor: productionOrderBacklogCursor,
    });

    expect(projected).toMatchObject({
      locationId: scope.locationId,
      candidateCount: 1,
      hasMore: true,
      nextCursor: expect.any(String),
      previewHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      generatedAt: '2026-08-22T15:00:00.000Z',
      groups: {
        readyToArchive: [
          { orderId: snapshot.orderId, reasons: ['no_operator_owned_facts'] },
        ],
        reviewIndividually: [],
        keptForSafety: [],
        alreadyHistorical: [],
      },
    });
  });
});
