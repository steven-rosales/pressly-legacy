import {
  deadWebhookEventsResultSchema,
  ingestWebhookEventResultSchema,
  type DeadWebhookEventsResult as DeadWebhookEventsWireResult,
} from '@pressly/ingress-system/contracts/webhook-ingestion-v1';
import { describe, expect, it } from 'vitest';
import { listDeadEventsHttpSurface } from '@pressly/ingress-system/operations/inbox/list-dead-events/http';
import { replayDeadEventHttpSurface } from '@pressly/ingress-system/operations/inbox/replay-dead-event/http';
import type { DeadWebhookEventsResult } from '@pressly/ingress-system/models/inbox';
import type { HttpRequest } from '@pressly/cells';
import {
  toIngestWebhookEventCommand,
  toIngestWebhookEventResult,
  toLinkWebhookReceiptError,
} from '@pressly/ingress-system/sources/cents';

const request = (query: unknown): HttpRequest => ({
  params: {},
  query: query as Record<string, unknown>,
  headers: {},
  body: undefined,
  context: {},
});

const toListDeadWebhookEventsQuery = (query: unknown) =>
  listDeadEventsHttpSurface.toSerializedInput(request(query));

const toDeadWebhookEventsResult = (value: DeadWebhookEventsResult) => {
  const response = listDeadEventsHttpSurface.present({
    kind: 'success',
    value,
  });
  return (response.body as { data: DeadWebhookEventsWireResult }).data;
};

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
    expect(() =>
      replayDeadEventHttpSurface.present({
        kind: 'failure',
        failure: {
          kind: 'not_found',
          code: 'webhook_event_not_found',
          message: 'The webhook event was not found.',
          safeMessage: 'The webhook event was not found.',
        },
      }),
    ).toThrow(expect.objectContaining({ kind: 'NotFoundError', status: 404 }));
    expect(
      toLinkWebhookReceiptError({
        kind: 'conflict',
        code: 'webhook_quarantine_link_conflict',
        message: 'The receipt is already linked.',
        safeMessage: 'The receipt is already linked.',
      }),
    ).toMatchObject({ kind: 'ConflictError', status: 409 });
  });
});
