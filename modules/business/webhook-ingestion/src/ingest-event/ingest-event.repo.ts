import { and, eq, webhookIngestion, type Database } from '@pressly/db';
import { invariantViolationError, type AppError } from '@pressly/errors';
import type { IngestWebhookEventRepository } from './ingest-event.port.ts';

const webhookEventInvariant = (code: string, message: string): AppError =>
  invariantViolationError({
    code: code.toLowerCase(),
    message,
    safeMessage: 'Stored webhook event data is inconsistent.',
  });

export const makeIngestWebhookEventRepository = (deps: {
  db: Database;
  ids: Readonly<{ next: () => string }>;
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
        sourceOccurredAt:
          command.sourceOccurredAt === null
            ? null
            : new Date(command.sourceOccurredAt),
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
    if (
      existing.rawBodySha256 !== command.rawBodySha256 ||
      existing.payloadHash !== payloadHash ||
      existing.subjectType !== command.subjectType ||
      existing.eventType !== command.eventType ||
      existing.subjectId !== command.subjectId ||
      existing.sourceLocationId !== command.sourceLocationId ||
      existing.sourceOccurredAt?.toISOString() !== command.sourceOccurredAt
    )
      throw webhookEventInvariant(
        'WEBHOOK_EVENT_DUPLICATE_DIVERGED',
        'Duplicate webhook event contains divergent data.',
      );
    return { eventId: existing.id, duplicate: true };
  },
});
