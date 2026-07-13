import type { IngestWebhookEventCommand } from '@pressly/contracts';
import { describe, expect, it, vi } from 'vitest';
import { reconcileCentsOrders } from '../../src/lpms/reconciliation.ts';

const event = (id: string): IngestWebhookEventCommand => ({
  source: 'cents',
  eventType: 'order_updated',
  deduplicationKey: id.padEnd(64, 'a').slice(0, 64),
  subjectType: 'order',
  subjectId: id,
  sourceLocationId: 'store-1',
  sourceOccurredAt: '2026-07-10T13:00:00.000Z',
  payload: { id },
  rawBodySha256: id.padEnd(64, 'b').slice(0, 64),
  disposition: 'process',
});

describe('Cents reconciliation adapter', () => {
  it('preserves the watermark when the vendor read API is unavailable', async () => {
    const ingestEvent = vi.fn();
    await expect(
      reconcileCentsOrders({
        vendor: {
          pullUpdatedOrders: vi.fn(async () => ({
            supported: false as const,
          })),
        },
        ingestEvent,
        watermark: 'cursor-1',
      }),
    ).resolves.toEqual({
      supported: false,
      ingested: 0,
      watermark: 'cursor-1',
    });
    expect(ingestEvent).not.toHaveBeenCalled();
  });

  it('durably ingests reconciled events without calling Production directly', async () => {
    const events = [event('one'), event('two')];
    const ingestEvent = vi.fn(async (command: IngestWebhookEventCommand) => ({
      tag: 'ok' as const,
      value: {
        eventId: command.subjectId ?? 'ignored',
        duplicate: false,
        status: 'pending' as const,
      },
    }));
    await expect(
      reconcileCentsOrders({
        vendor: {
          pullUpdatedOrders: vi.fn(async () => ({
            supported: true as const,
            events,
            nextWatermark: 'cursor-2',
          })),
        },
        ingestEvent,
        watermark: 'cursor-1',
      }),
    ).resolves.toMatchObject({
      supported: true,
      ingested: 2,
      watermark: 'cursor-2',
    });
    expect(ingestEvent).toHaveBeenCalledTimes(2);
  });
});
