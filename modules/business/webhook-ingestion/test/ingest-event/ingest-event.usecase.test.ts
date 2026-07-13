import { describe, expect, it, vi } from 'vitest';
import { makeIngestWebhookEvent } from '../../src/ingest-event/ingest-event.usecase.ts';

const command = {
  source: 'source_a',
  eventType: 'order.updated',
  deduplicationKey: 'a'.repeat(64),
  subjectType: 'order',
  subjectId: 'order-1',
  sourceLocationId: 'store-1',
  sourceOccurredAt: '2026-07-10T13:00:00.000Z',
  payload: { nested: { second: 2, first: 1 }, orderId: 'order-1' },
  rawBodySha256: 'b'.repeat(64),
  disposition: 'process' as const,
};

describe('generic webhook ingestion', () => {
  it('hashes opaque canonical payload and acknowledges only after storage', async () => {
    const ingest = vi.fn(async () => ({
      eventId: '00000000-0000-4000-8000-000000000001',
      duplicate: false,
    }));
    const usecase = makeIngestWebhookEvent({
      repo: { ingest },
      clock: { now: () => new Date('2026-07-10T14:00:00.000Z') },
    });

    await expect(usecase(command)).resolves.toMatchObject({
      tag: 'ok',
      value: { status: 'pending', duplicate: false },
    });
    expect(ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        command,
        payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it('stores ignored event metadata without inventing a payload', async () => {
    const ingest = vi.fn(async () => ({
      eventId: '00000000-0000-4000-8000-000000000002',
      duplicate: true,
    }));
    const usecase = makeIngestWebhookEvent({
      repo: { ingest },
      clock: { now: () => new Date() },
    });
    await expect(
      usecase({ ...command, payload: null, disposition: 'ignore' }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { status: 'ignored', duplicate: true },
    });
    expect(ingest).toHaveBeenCalledWith(
      expect.objectContaining({ payloadHash: null }),
    );
  });

  it('returns a stable unavailable error when durable storage fails', async () => {
    const usecase = makeIngestWebhookEvent({
      repo: {
        ingest: vi.fn(async () => {
          throw new Error('database unavailable');
        }),
      },
      clock: { now: () => new Date() },
    });
    await expect(usecase(command)).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'webhook_event_ingestion_failed', status: 503 },
    });
  });
});
