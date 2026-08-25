import { describe, expect, it } from 'vitest';
import type { CommitOrderBacklogBulkCommandIdentity } from './execute.ts';
import {
  resolveCommitOrderBacklogReplay,
  serializeCommitOrderBacklogBulkCommand,
  serializeCommitOrderBacklogOrderCommand,
} from './idempotency.ts';

const identity: CommitOrderBacklogBulkCommandIdentity = {
  operation: 'production_order_backlog_bulk_resolution',
  locationId: 'location-1',
  actorId: '75000000-0000-4000-8000-000000000001',
  target: {
    entityType: 'production_order_bulk_resolution',
    entityId: null,
  },
  expectedVersion: null,
  payload: {
    filter: 'all_due_before_cutoff',
    cutoff: '2026-08-01T00:00:00.000Z',
    reason: 'processor_not_in_use',
    note: null,
    maxOrders: 250,
    cursor: null,
    previewHash: 'a'.repeat(64),
  },
};
const result = {
  locationId: identity.locationId,
  bulkOperationId: '75000000-0000-4000-8000-000000000002',
  previewHash: identity.payload.previewHash,
  nextCursor: null,
  resolvedCount: 0,
  resolved: [],
  committedAt: '2026-08-22T16:00:00.000Z',
  replayed: false,
} as const;

describe('commit order backlog idempotency', () => {
  it('serializes the stable aggregate and per-order identities', () => {
    expect(serializeCommitOrderBacklogBulkCommand(identity)).toEqual(identity);
    expect(
      serializeCommitOrderBacklogOrderCommand({
        operation: 'production_order_bulk_resolved_without_production',
        locationId: identity.locationId,
        actorId: identity.actorId,
        target: {
          entityType: 'production_order',
          entityId: '75000000-0000-4000-8000-000000000003',
        },
        expectedVersion: 2,
        payload: {
          bulkOperationId: result.bulkOperationId,
          previewHash: identity.payload.previewHash,
          reason: identity.payload.reason,
        },
      }),
    ).toEqual({
      operation: 'production_order_bulk_resolved_without_production',
      locationId: identity.locationId,
      actorId: identity.actorId,
      target: {
        entityType: 'production_order',
        entityId: '75000000-0000-4000-8000-000000000003',
      },
      expectedVersion: 2,
      payload: {
        bulkOperationId: result.bulkOperationId,
        previewHash: identity.payload.previewHash,
        reason: identity.payload.reason,
      },
    });
  });

  it('replays only the identical valid aggregate receipt and marks it replayed', () => {
    expect(resolveCommitOrderBacklogReplay(null, identity)).toEqual({
      kind: 'miss',
    });
    expect(
      resolveCommitOrderBacklogReplay(
        {
          valid: true,
          command: serializeCommitOrderBacklogBulkCommand(identity),
          result: { ...result },
        },
        identity,
      ),
    ).toEqual({ kind: 'replay', result: { ...result, replayed: true } });
  });

  it.each([
    {
      name: 'divergent command',
      stored: {
        valid: true as const,
        command: serializeCommitOrderBacklogBulkCommand({
          ...identity,
          payload: { ...identity.payload, reason: 'duplicate_or_test' },
        }),
        result: { ...result },
      },
    },
    {
      name: 'invalid envelope',
      stored: {
        valid: false as const,
        command: serializeCommitOrderBacklogBulkCommand(identity),
        result: { ...result },
      },
    },
    {
      name: 'non-object result',
      stored: {
        valid: false as const,
        command: serializeCommitOrderBacklogBulkCommand(identity),
        result: {},
      },
    },
  ])('classifies $name as a conflict', ({ stored }) => {
    expect(resolveCommitOrderBacklogReplay(stored, identity)).toEqual({
      kind: 'conflict',
    });
  });
});
