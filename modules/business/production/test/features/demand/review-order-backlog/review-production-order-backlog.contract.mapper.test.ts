import { describe, expect, it } from 'vitest';
import {
  toCommitProductionOrderBacklogCommand,
  toPreviewProductionOrderBacklogCommand,
  toProductionOrderBacklogCommitResult,
  toProductionOrderBacklogPreviewResult,
} from '../../../../src/features/demand/review-order-backlog/review-production-order-backlog.contract.mapper.ts';

const locationId = 'location-1';
const actorId = '00000000-0000-4000-8000-000000000201';
const cutoff = '2026-07-01T00:00:00.000Z';
const previewHash = 'a'.repeat(64);

const requestScope = {
  filter: 'all_due_before_cutoff' as const,
  cutoff,
  reason: 'processor_not_in_use' as const,
  cursor: null,
  maxOrders: 250,
};

describe('review production order backlog boundary mapping', () => {
  it('combines a validated preview request with route-owned location scope', () => {
    expect(
      toPreviewProductionOrderBacklogCommand(requestScope, locationId),
    ).toEqual({ locationId, ...requestScope });
  });

  it('combines a validated commit with authenticated actor scope', () => {
    expect(
      toCommitProductionOrderBacklogCommand(
        {
          ...requestScope,
          note: null,
          previewHash,
          idempotencyKey: 'backlog-commit-1',
        },
        { locationId, actorId },
      ),
    ).toEqual({
      locationId,
      actorId,
      ...requestScope,
      note: null,
      previewHash,
      idempotencyKey: 'backlog-commit-1',
    });
  });

  it('copies readonly preview groups into the serialized result', () => {
    const preview = {
      locationId,
      ...requestScope,
      candidateCount: 1,
      hasMore: false,
      nextCursor: null,
      previewHash,
      generatedAt: '2026-07-27T04:00:00.000Z',
      groups: {
        readyToArchive: [
          {
            orderId: '00000000-0000-4000-8000-000000000001',
            displayReference: 'Order 1001',
            dueAt: '2026-06-01T00:00:00.000Z',
            category: 'ready_to_archive' as const,
            reasons: ['no_operator_owned_facts' as const],
            expectedVersion: 2,
            expectedResolutionState: 'open' as const,
          },
        ],
        reviewIndividually: [],
        keptForSafety: [],
        alreadyHistorical: [],
      },
    };

    expect(toProductionOrderBacklogPreviewResult(preview)).toEqual(preview);
  });

  it('preserves the replay-safe canonical commit timestamp', () => {
    const committed = {
      locationId,
      bulkOperationId: '00000000-0000-4000-8000-000000000301',
      previewHash,
      nextCursor: null,
      resolvedCount: 0,
      resolved: [],
      committedAt: '2026-07-27T04:00:00.000Z',
      replayed: false,
    };

    expect(toProductionOrderBacklogCommitResult(committed)).toEqual(committed);
  });
});
