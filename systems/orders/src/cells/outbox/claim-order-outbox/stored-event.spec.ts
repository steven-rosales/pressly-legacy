import { describe, expect, it } from 'vitest';
import {
  claimedOrderOutboxEventFromRow,
  decodeStoredFulfillmentDemand,
  type StoredOrderOutboxEvent,
} from './stored-event.postgres.ts';

const payload = () => ({
  schemaVersion: 2 as const,
  eventType: 'fulfillment_demand_changed' as const,
  fulfillmentId: '00000000-0000-4000-8000-000000000003',
  displayNumber: 'P-100',
  locationId: 'location-1',
  typeCode: 'wash_fold',
  admissionState: 'released' as const,
  commercialState: 'open' as const,
  dueAt: '2026-08-23T20:00:00.000Z',
  estimatedWeightLbs: 18,
  estimatedWeightSource: 'source_estimate',
  version: 3,
  observedAt: '2026-08-22T16:00:00.000Z',
});

const row = (): StoredOrderOutboxEvent => ({
  id: '00000000-0000-4000-8000-000000000001',
  orderId: '00000000-0000-4000-8000-000000000002',
  fulfillmentId: '00000000-0000-4000-8000-000000000003',
  eventType: 'fulfillment_demand_changed',
  aggregateVersion: 3,
  payload: payload(),
  status: 'processing',
  attempts: 2,
  availableAt: new Date('2026-08-22T15:00:00.000Z'),
  leaseOwner: 'stored-owner',
  leaseExpiresAt: new Date('2026-08-22T15:01:00.000Z'),
  completedAt: null,
  deadAt: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  createdAt: new Date('2026-08-22T14:00:00.000Z'),
});

const lease = {
  owner: 'worker-1',
  expiresAt: new Date('2026-08-22T16:01:00.000Z'),
};

describe('claimed Order outbox persistence boundary', () => {
  it('decodes the exact versioned demand and uses the newly acquired lease', () => {
    expect(claimedOrderOutboxEventFromRow(row(), lease)).toEqual({
      id: row().id,
      orderId: row().orderId,
      fulfillmentId: row().fulfillmentId,
      aggregateVersion: 3,
      attempts: 2,
      leaseOwner: 'worker-1',
      leaseExpiresAt: lease.expiresAt,
      kind: 'fulfillment_demand_changed',
      eventType: 'fulfillment_demand_changed',
      payload: {
        ...payload(),
        dueAt: new Date(payload().dueAt),
        observedAt: new Date(payload().observedAt),
      },
    });
  });

  it.each([
    [
      'unsupported event type',
      { ...row(), eventType: 'unknown' },
      'unsupported_event_type',
    ],
    [
      'invalid payload',
      { ...row(), payload: { ...payload(), dueAt: 'bad' } },
      'invalid_payload',
    ],
    [
      'aggregate mismatch',
      { ...row(), aggregateVersion: 4 },
      'aggregate_mismatch',
    ],
  ] as const)(
    'retains %s as a claimed invalid delivery',
    (_, stored, error) => {
      expect(claimedOrderOutboxEventFromRow(stored, lease)).toMatchObject({
        kind: 'invalid',
        eventType: stored.eventType,
        payload: stored.payload,
        validationError: error,
      });
    },
  );

  it('checks the event type before the serialized payload contract', () => {
    expect(
      decodeStoredFulfillmentDemand({
        eventType: 'unknown',
        payload: { invalid: true },
        fulfillmentId: row().fulfillmentId,
        aggregateVersion: 3,
      }),
    ).toEqual({
      kind: 'invalid',
      validationError: 'unsupported_event_type',
    });
  });

  it('throws the exact invariant for a non-JSON mapper fault', () => {
    expect(() =>
      claimedOrderOutboxEventFromRow(
        { ...row(), payload: { date: new Date() } },
        lease,
      ),
    ).toThrow(
      expect.objectContaining({
        kind: 'InvariantViolationError',
        code: 'order_outbox_payload_invalid_json',
      }),
    );
  });
});
