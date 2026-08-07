import {
  deadWebhookEventsResultSchema,
  ingestWebhookEventResultSchema,
} from '@pressly/contracts/webhook-ingestion';
import { describe, expect, it } from 'vitest';
import {
  toDeadWebhookEventsResult,
  toListDeadWebhookEventsQuery,
  toReplayDeadWebhookEventError,
} from '../../src/http/webhook-ingestion/dead-letters/dead-letter.contract.mapper.ts';
import {
  toIngestWebhookEventCommand,
  toIngestWebhookEventResult,
  toLinkWebhookReceiptError,
} from '../../src/http/webhooks/cents/cents-webhook.contract.mapper.ts';

describe('webhook ingestion API mappers', () => {
  it('decodes the validated webhook timestamp once for the application', () => {
    const command = toIngestWebhookEventCommand({
      source: 'cents',
      eventType: 'order_updated',
      deduplicationKey: 'a'.repeat(64),
      subjectType: 'order',
      subjectId: 'order-1',
      sourceLocationId: 'store-1',
      sourceOccurredAt: '2026-07-10T13:00:00.000Z',
      payload: { status: 'SUBMITTED' },
      rawBodySha256: 'b'.repeat(64),
      disposition: 'process',
    });

    expect(command.sourceOccurredAt).toEqual(
      new Date('2026-07-10T13:00:00.000Z'),
    );
  });

  it('serializes application Dates into the dead-letter wire contract', () => {
    const output = toDeadWebhookEventsResult({
      items: [
        {
          eventId: '00000000-0000-4000-8000-000000000001',
          source: 'cents',
          eventType: 'order_updated',
          subjectType: 'order',
          subjectId: 'order-1',
          sourceLocationId: 'store-1',
          sourceOccurredAt: new Date('2026-07-10T13:00:00.000Z'),
          attempts: 3,
          lastErrorCode: 'source_location_unmapped',
          receivedAt: new Date('2026-07-10T13:01:00.000Z'),
        },
      ],
      nextEventId: null,
      asOf: new Date('2026-07-10T14:00:00.000Z'),
    });

    expect(deadWebhookEventsResultSchema.parse(output)).toEqual(
      expect.objectContaining({
        asOf: '2026-07-10T14:00:00.000Z',
        items: [
          expect.objectContaining({
            sourceOccurredAt: '2026-07-10T13:00:00.000Z',
            receivedAt: '2026-07-10T13:01:00.000Z',
          }),
        ],
      }),
    );
  });

  it('maps only declared query and response fields', () => {
    expect(toListDeadWebhookEventsQuery({ limit: 25 })).toEqual({ limit: 25 });
    expect(
      ingestWebhookEventResultSchema.parse(
        toIngestWebhookEventResult({
          eventId: '00000000-0000-4000-8000-000000000002',
          duplicate: false,
          status: 'pending',
        }),
      ),
    ).toEqual({
      eventId: '00000000-0000-4000-8000-000000000002',
      duplicate: false,
      status: 'pending',
    });
  });

  it('rejects malformed transport cursors before application execution', () => {
    expect(() =>
      toListDeadWebhookEventsQuery({ cursor: 'not-a-cursor', limit: 25 }),
    ).toThrow(
      expect.objectContaining({ code: 'dead_webhook_event_cursor_invalid' }),
    );
  });

  it('encodes and decodes pagination cursors only at the HTTP edge', () => {
    const nextEventId = '00000000-0000-4000-8000-000000000003';
    const output = toDeadWebhookEventsResult({
      items: [],
      nextEventId,
      asOf: new Date('2026-07-10T14:00:00.000Z'),
    });

    expect(output.nextCursor).not.toBe(nextEventId);
    expect(
      toListDeadWebhookEventsQuery({
        cursor: output.nextCursor ?? 'missing-cursor',
        limit: 25,
      }),
    ).toEqual({ afterEventId: nextEventId, limit: 25 });
  });

  it('maps expected application failures into HTTP errors only at the edge', () => {
    expect(
      toReplayDeadWebhookEventError({
        code: 'webhook_event_not_found',
        message: 'The webhook event was not found.',
      }),
    ).toMatchObject({ kind: 'NotFoundError', status: 404 });
    expect(
      toLinkWebhookReceiptError({
        code: 'webhook_quarantine_link_conflict',
        message: 'The receipt is already linked.',
      }),
    ).toMatchObject({ kind: 'ConflictError', status: 409 });
  });
});
