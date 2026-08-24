import type { PostgresDatabase } from '@pressly/postgres/client';
import { and, eq } from '@pressly/postgres/query';
import { invariantViolationError } from '@pressly/errors/factories';
import type { IngressSchema } from '../../../schema/ingress.ts';
import type { IngestEventIdSource, IngestEventRepository } from './types.ts';

export const makeIngestEventPostgresRepository = (deps: {
  db: PostgresDatabase;
  schema: Pick<IngressSchema, 'webhookEvents'>;
  ids: IngestEventIdSource;
}): IngestEventRepository => ({
  ingest: async ({ command, payloadHash, now }) => {
    const ignored = command.disposition === 'ignore';

    const [inserted] = await deps.db
      .insert(deps.schema.webhookEvents)
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
          deps.schema.webhookEvents.source,
          deps.schema.webhookEvents.dedupeKey,
        ],
      })
      .returning({ id: deps.schema.webhookEvents.id });
    if (inserted !== undefined)
      return { eventId: inserted.id, duplicate: false };

    const [existing] = await deps.db
      .select({
        id: deps.schema.webhookEvents.id,
        rawBodySha256: deps.schema.webhookEvents.rawBodySha256,
      })
      .from(deps.schema.webhookEvents)
      .where(
        and(
          eq(deps.schema.webhookEvents.source, command.source),
          eq(deps.schema.webhookEvents.dedupeKey, command.deduplicationKey),
        ),
      )
      .limit(1);

    if (existing === undefined)
      throw invariantViolationError({
        code: 'webhook_event_insert_result_missing',
        message: 'Webhook event insert raced and vanished.',
        safeMessage: 'Stored webhook event data is inconsistent.',
      });
    if (existing.rawBodySha256 !== command.rawBodySha256)
      throw invariantViolationError({
        code: 'webhook_event_duplicate_diverged',
        message:
          'Duplicate webhook event identity refers to different raw data.',
        safeMessage: 'Stored webhook event data is inconsistent.',
      });
    return { eventId: existing.id, duplicate: true };
  },
});
