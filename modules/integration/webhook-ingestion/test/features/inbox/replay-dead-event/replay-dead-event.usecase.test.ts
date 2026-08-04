import { describe, expect, it, vi } from 'vitest';
import { makeReplayDeadWebhookEvent } from '../../../../src/features/inbox/replay-dead-event/replay-dead-event.usecase.ts';

const eventId = '00000000-0000-4000-8000-000000000001';

describe('dead webhook event replay', () => {
  it('requeues through ingestion without invoking a downstream module', async () => {
    const store = {
      list: vi.fn(async () => []),
      replay: vi.fn(async () => 'queued' as const),
    };
    const replay = makeReplayDeadWebhookEvent({
      store,
      clock: { now: () => new Date('2026-07-10T14:00:00.000Z') },
    });

    await expect(replay({ eventId })).resolves.toEqual({
      tag: 'ok',
      value: { eventId, outcome: 'queued' },
    });
    expect(store.replay).toHaveBeenCalledOnce();
  });
});
