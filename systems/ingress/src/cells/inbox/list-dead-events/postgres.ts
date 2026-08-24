import type { PostgresDatabase } from '@pressly/postgres/client';
import { and, asc, eq, gt } from '@pressly/postgres/query';
import type { IngressSchema } from '../../../schema/ingress.ts';
import type { ListDeadEventsRepository } from './types.ts';

export const makeListDeadEventsPostgresRepository = (
  db: PostgresDatabase,
  ingress: Pick<IngressSchema, 'webhookEvents'>,
): ListDeadEventsRepository => ({
  list: ({ source, afterEventId, limit }) =>
    db
      .select({
        eventId: ingress.webhookEvents.id,
        source: ingress.webhookEvents.source,
        eventType: ingress.webhookEvents.eventType,
        subjectType: ingress.webhookEvents.subjectType,
        subjectId: ingress.webhookEvents.subjectId,
        sourceLocationId: ingress.webhookEvents.sourceLocationId,
        sourceOccurredAt: ingress.webhookEvents.sourceOccurredAt,
        attempts: ingress.webhookEvents.attempts,
        lastErrorCode: ingress.webhookEvents.lastErrorCode,
        receivedAt: ingress.webhookEvents.receivedAt,
      })
      .from(ingress.webhookEvents)
      .where(
        and(
          eq(ingress.webhookEvents.status, 'dead'),
          source === undefined
            ? undefined
            : eq(ingress.webhookEvents.source, source),
          afterEventId === undefined
            ? undefined
            : gt(ingress.webhookEvents.id, afterEventId),
        ),
      )
      .orderBy(asc(ingress.webhookEvents.id))
      .limit(limit),
});
