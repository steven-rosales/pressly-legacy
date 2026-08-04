import { describe, expect, it, vi } from 'vitest';
import { makeListDeadWebhookEvents } from '../../../../src/features/inbox/list-dead-events/list-dead-events.usecase.ts';

const eventId = '00000000-0000-4000-8000-000000000001';
const deadEvent = {
  eventId,
  source: 'cents',
  eventType: 'order_updated',
  subjectType: 'order',
  subjectId: 'order-1',
  sourceLocationId: 'store-1',
  sourceOccurredAt: new Date('2026-07-10T13:00:00.000Z'),
  attempts: 3,
  lastErrorCode: 'source_location_unmapped',
  receivedAt: new Date('2026-07-10T13:01:00.000Z'),
};

describe('dead webhook event listing', () => {
  it('lists bounded metadata without payloads or error messages', async () => {
    const store = {
      list: vi.fn(async () => [deadEvent]),
      replay: vi.fn(async () => 'queued' as const),
    };
    const list = makeListDeadWebhookEvents({
      store,
      clock: { now: () => new Date('2026-07-10T14:00:00.000Z') },
    });

    await expect(list({ source: 'cents', limit: 25 })).resolves.toMatchObject({
      tag: 'ok',
      value: {
        items: [deadEvent],
        nextEventId: null,
        asOf: new Date('2026-07-10T14:00:00.000Z'),
      },
    });
  });
});
