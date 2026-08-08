import { type Database } from '@pressly/db/client';
import { and, eq } from '@pressly/db/query';
import * as webhookIngestion from '@pressly/db/schema/webhook-ingestion';
import { type AppError } from '@pressly/errors/app-error';
import { invariantViolationError } from '@pressly/errors/factories';
import type { IdSource } from '@pressly/kernel';
import type { IngestWebhookEventRepository } from './ingest-event.port.ts';

const webhookEventInvariant = (code: string, message: string): AppError =>
  invariantViolationError({
    code: code.toLowerCase(),
    message,
    safeMessage: 'Stored webhook event data is inconsistent.',
  });

export const makeIngestWebhookEventRepository = (deps: {
  db: Database;
  ids: IdSource;
}): IngestWebhookEventRepository => ({
  ingest: async ({ command, payloadHash, now }) => {
    const ignored = command.disposition === 'ignore';
    const [inserted] = await deps.db
      .insert(webhookIngestion.webhookEvents)
      .values({
        id: deps.ids.next(),
        source: command.source,
        eventType: command.eventType,
        dedupeKey: command.deduplicationKey,
        subjectType: command.subjectType,
        subjectId: command.subjectId,
        sourceLocationId: command.sourceLocationId,
        sourceOccurredAt: command.sourceOccurredAt,
        payload: command.payload,
        payloadHash,
        rawBodySha256: command.rawBodySha256,
        status: ignored ? 'processed' : 'pending',
        attempts: 0,
        availableAt: now,
        receivedAt: now,
        processedAt: ignored ? now : null,
      })
      .onConflictDoNothing({
        target: [
          webhookIngestion.webhookEvents.source,
          webhookIngestion.webhookEvents.dedupeKey,
        ],
      })
      .returning({ id: webhookIngestion.webhookEvents.id });
    if (inserted !== undefined)
      return { eventId: inserted.id, duplicate: false };

    const [existing] = await deps.db
      .select()
      .from(webhookIngestion.webhookEvents)
      .where(
        and(
          eq(webhookIngestion.webhookEvents.source, command.source),
          eq(
            webhookIngestion.webhookEvents.dedupeKey,
            command.deduplicationKey,
          ),
        ),
      )
      .limit(1);
    if (existing === undefined)
      throw webhookEventInvariant(
        'WEBHOOK_EVENT_INSERT_RESULT_MISSING',
        'Webhook event insert raced and vanished.',
      );
    // The raw receipt is the immutable external observation. Adapter-owned
    // classification and canonical payload may evolve between redeliveries,
    // but one deduplication identity may never name different source bytes.
    if (existing.rawBodySha256 !== command.rawBodySha256)
      throw webhookEventInvariant(
        'WEBHOOK_EVENT_DUPLICATE_DIVERGED',
        'Duplicate webhook event identity refers to different raw data.',
      );
    return { eventId: existing.id, duplicate: true };
  },
});
