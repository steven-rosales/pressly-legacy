import { describe, expect, it } from 'vitest';
import { makeIgnoredCentsEventHandler } from '../../../../src/jobs/process-webhook-inbox/cents/cents-ignored.handler.ts';

describe('ignored legacy Cents event consumer', () => {
  it('acknowledges a previously queued event without canonical dependencies', async () => {
    await expect(
      makeIgnoredCentsEventHandler()({
        eventId: '00000000-0000-4000-8000-000000000001',
        workerId: 'worker-1',
        attempt: 1,
        source: 'cents',
        eventType: 'customer_updated',
        subjectType: 'customer',
        subjectId: 'customer-1',
        sourceLocationId: null,
        sourceOccurredAt: null,
        receivedAt: '2026-07-10T13:00:01.000Z',
        payloadHash: 'a'.repeat(64),
        recoveredLease: false,
        payload: {},
      }),
    ).resolves.toEqual({ tag: 'ok' });
  });
});
