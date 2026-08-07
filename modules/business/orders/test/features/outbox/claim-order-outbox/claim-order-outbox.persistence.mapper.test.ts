import { describe, expect, it } from 'vitest';
import { claimedOrderOutboxEventFromRow } from '../../../../src/features/outbox/claim-order-outbox/claim-order-outbox.persistence.mapper.ts';

describe('claimed Order outbox persistence boundary', () => {
  it('fails closed when the database payload is not JSON', () => {
    const row: Parameters<typeof claimedOrderOutboxEventFromRow>[0] = {
      id: '00000000-0000-4000-8000-000000000001',
      orderId: '00000000-0000-4000-8000-000000000002',
      fulfillmentId: '00000000-0000-4000-8000-000000000003',
      eventType: 'fulfillment_demand.changed',
      aggregateVersion: 1,
      payload: { observedAt: new Date('2026-07-29T12:00:00.000Z') },
      status: 'processing',
      attempts: 1,
      availableAt: new Date('2026-07-29T12:00:00.000Z'),
      leaseOwner: 'worker-1',
      leaseExpiresAt: new Date('2026-07-29T12:01:00.000Z'),
      completedAt: null,
      deadAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: new Date('2026-07-29T12:00:00.000Z'),
    };

    expect(() =>
      claimedOrderOutboxEventFromRow(row, {
        owner: 'worker-1',
        expiresAt: new Date('2026-07-29T12:01:00.000Z'),
      }),
    ).toThrow(
      expect.objectContaining({
        tag: 'AppError',
        kind: 'InvariantViolationError',
        code: 'order_outbox_payload_invalid_json',
      }),
    );
  });
});
