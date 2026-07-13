import { describe, expect, it, vi } from 'vitest';
import {
  makeListDeadWebhookEvents,
  makeReplayDeadWebhookEvent,
} from '../../src/recover-events/recover-events.usecase.ts';

const eventId = '00000000-0000-4000-8000-000000000001';
const deadEvent = {
  eventId,
  source: 'cents',
  eventType: 'order_updated',
  subjectType: 'order',
  subjectId: 'order-1',
  sourceLocationId: 'store-1',
  sourceOccurredAt: '2026-07-10T13:00:00.000Z',
  attempts: 3,
  lastErrorCode: 'source_location_unmapped',
  receivedAt: '2026-07-10T13:01:00.000Z',
};

describe('generic dead-event recovery', () => {
  it('lists bounded metadata without payloads or error messages', async () => {
    const repo = {
      listDead: vi.fn(async () => [deadEvent]),
      replay: vi.fn(async () => 'queued' as const),
    };
    const list = makeListDeadWebhookEvents({
      repo,
      clock: { now: () => new Date('2026-07-10T14:00:00.000Z') },
    });
    await expect(list({ source: 'cents', limit: 25 })).resolves.toMatchObject({
      tag: 'ok',
      value: { items: [deadEvent], nextCursor: null },
    });
  });

  it('requeues through ingestion without invoking a downstream module', async () => {
    const repo = {
      listDead: vi.fn(async () => []),
      replay: vi.fn(async () => 'queued' as const),
    };
    const replay = makeReplayDeadWebhookEvent({
      repo,
      clock: { now: () => new Date('2026-07-10T14:00:00.000Z') },
    });
    await expect(
      replay({ eventId, confirmation: 'replay-dead-webhook-event' }),
    ).resolves.toEqual({
      tag: 'ok',
      value: { eventId, outcome: 'queued' },
    });
    expect(repo.replay).toHaveBeenCalledOnce();
  });
});
