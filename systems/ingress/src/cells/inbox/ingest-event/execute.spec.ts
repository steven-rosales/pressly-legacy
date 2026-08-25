import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it, vi } from 'vitest';
import { ingestEventCellDeclaration } from './cell.ts';
import { makeExecuteIngestEvent } from './execute.ts';

const now = new Date('2026-08-22T16:00:00.000Z');
const command = {
  source: 'cents',
  eventType: 'order_updated',
  deduplicationKey: 'a'.repeat(64),
  subjectType: 'order',
  subjectId: 'order-1',
  sourceLocationId: 'store-1',
  sourceOccurredAt: new Date('2026-08-22T15:00:00.000Z'),
  payload: { second: 2, first: 1 },
  rawBodySha256: 'b'.repeat(64),
  disposition: 'process' as const,
};

describe('ingest-event execution', () => {
  proveOperation({
    operationId: 'ingress.ingest-event.v1',
    declaration: ingestEventCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'hashes canonical normalized payload before durable acknowledgement',
        proves: ['executor-success'],
        run: async () => {
          const ingest = vi.fn(async () => ({
            eventId: '81000000-0000-4000-8000-000000000001',
            duplicate: false,
          }));
          const execute = makeExecuteIngestEvent({
            repo: { ingest },
            clock: { now: () => now },
          });

          await expect(execute(command)).resolves.toEqual({
            kind: 'success',
            value: {
              eventId: '81000000-0000-4000-8000-000000000001',
              duplicate: false,
              status: 'pending',
            },
          });
          expect(ingest).toHaveBeenCalledWith({
            command,
            payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/),
            now,
          });
        },
      },
    ],
  });

  it('stores an ignored observation as processed without inventing payload', async () => {
    const ingest = vi.fn(async () => ({
      eventId: '81000000-0000-4000-8000-000000000002',
      duplicate: true,
    }));
    const execute = makeExecuteIngestEvent({
      repo: { ingest },
      clock: { now: () => now },
    });
    await expect(
      execute({ ...command, payload: null, disposition: 'ignore' }),
    ).resolves.toMatchObject({
      kind: 'success',
      value: { duplicate: true, status: 'ignored' },
    });
    expect(ingest).toHaveBeenCalledWith(
      expect.objectContaining({ payloadHash: null }),
    );
  });

  it('keeps payload-shape invariant faults distinct from persistence faults', async () => {
    const payload: { self?: unknown } = {};
    payload.self = payload;
    const ingest = vi.fn(async () => ({
      eventId: '81000000-0000-4000-8000-000000000003',
      duplicate: false,
    }));
    const execute = makeExecuteIngestEvent({
      repo: { ingest },
      clock: { now: () => now },
    });

    await expect(
      execute({ ...command, payload: payload as never }),
    ).rejects.toMatchObject({ code: 'webhook_payload_hash_failed' });
    expect(ingest).not.toHaveBeenCalled();
  });
});
