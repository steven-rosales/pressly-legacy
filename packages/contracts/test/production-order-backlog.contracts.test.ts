import { describe, expect, it } from 'vitest';
import {
  commitProductionOrderBacklogCommandSchema,
  productionOrderBacklogCommitResultSchema,
  productionOrderBacklogMaximumPreviewSize,
  productionOrderBacklogPreviewSchema,
  previewProductionOrderBacklogCommandSchema,
} from '../src/production/production-order-backlog.contracts.ts';

const locationId = 'location-main';
const orderId = '00000000-0000-4000-8000-000000000001';
const bulkOperationId = '00000000-0000-4000-8000-000000000002';
const cutoff = '2026-07-01T00:00:00.000Z';
const previewHash = 'a'.repeat(64);

describe('production order backlog contracts', () => {
  it('bounds the server-owned preview to 250 orders', () => {
    expect(
      previewProductionOrderBacklogCommandSchema.parse({
        locationId,
        filter: 'all_due_before_cutoff',
        cutoff,
        reason: 'processor_not_in_use',
      }).maxOrders,
    ).toBe(productionOrderBacklogMaximumPreviewSize);

    expect(
      previewProductionOrderBacklogCommandSchema.safeParse({
        locationId,
        filter: 'all_due_before_cutoff',
        cutoff,
        reason: 'processor_not_in_use',
        maxOrders: productionOrderBacklogMaximumPreviewSize + 1,
      }).success,
    ).toBe(false);
  });

  it('requires an exact preview hash and idempotency key for commit', () => {
    expect(
      commitProductionOrderBacklogCommandSchema.parse({
        locationId,
        filter: 'all_due_before_cutoff',
        cutoff,
        reason: 'completed_outside_pressly',
        previewHash,
        idempotencyKey: 'bulk-resolution-1',
      }),
    ).toEqual({
      locationId,
      filter: 'all_due_before_cutoff',
      cutoff,
      reason: 'completed_outside_pressly',
      cursor: null,
      maxOrders: 250,
      note: null,
      previewHash,
      idempotencyKey: 'bulk-resolution-1',
    });
  });

  it('requires an explanatory note when a bulk commit uses the other reason', () => {
    expect(
      commitProductionOrderBacklogCommandSchema.safeParse({
        locationId,
        filter: 'all_due_before_cutoff',
        cutoff,
        reason: 'other',
        previewHash,
        idempotencyKey: 'bulk-resolution-other',
      }).success,
    ).toBe(false);
    expect(
      commitProductionOrderBacklogCommandSchema.safeParse({
        locationId,
        filter: 'all_due_before_cutoff',
        cutoff,
        reason: 'other',
        note: 'The manager documented the exceptional cleanup.',
        previewHash,
        idempotencyKey: 'bulk-resolution-other',
      }).success,
    ).toBe(true);
  });

  it('rejects a preview whose category does not match its server group', () => {
    expect(
      productionOrderBacklogPreviewSchema.safeParse({
        locationId,
        filter: 'all_due_before_cutoff',
        cutoff,
        reason: 'processor_not_in_use',
        maxOrders: 250,
        candidateCount: 1,
        hasMore: false,
        cursor: null,
        nextCursor: null,
        previewHash,
        generatedAt: cutoff,
        groups: {
          readyToArchive: [
            {
              orderId,
              displayReference: 'Order 1001',
              dueAt: cutoff,
              category: 'kept_for_safety',
              reasons: ['execution_committed'],
              expectedVersion: 2,
              expectedResolutionState: 'open',
            },
          ],
          reviewIndividually: [],
          keptForSafety: [],
          alreadyHistorical: [],
        },
      }).success,
    ).toBe(false);
  });

  it('rejects the retired source-terminal recommendation scope', () => {
    expect(
      previewProductionOrderBacklogCommandSchema.safeParse({
        locationId,
        filter: 'source_terminal_before_cutoff',
        cutoff,
        reason: 'completed_outside_pressly',
      }).success,
    ).toBe(false);
  });

  it('returns a sanitized, internally consistent bulk result', () => {
    expect(
      productionOrderBacklogCommitResultSchema.parse({
        locationId,
        bulkOperationId,
        previewHash,
        nextCursor: null,
        resolvedCount: 1,
        resolved: [
          {
            orderId,
            resolutionState: 'resolved_without_production',
            version: 3,
          },
        ],
        committedAt: cutoff,
        replayed: false,
      }),
    ).toMatchObject({ resolvedCount: 1, replayed: false });
  });
});
