import { isJsonValue } from '@pressly/codec';
import type { PostgresDatabase } from '@pressly/postgres/client';
import { and, asc, eq, lte, or } from '@pressly/postgres/query';
import { invariantViolationError } from '@pressly/errors/factories';
import type { ClaimedWebhookEvent } from '../../../model/inbox.ts';
import type { IngressSchema } from '../../../schema/ingress.ts';
import type { ClaimEventsRepository } from './types.ts';

export const makeClaimEventsPostgresRepository = (
  db: PostgresDatabase,
  ingress: Pick<IngressSchema, 'webhookEvents'>,
): ClaimEventsRepository => ({
  claim: ({ command, now }) =>
    db.transaction(async (transaction) => {
      const claimable = await transaction
        .select()
        .from(ingress.webhookEvents)
        .where(
          or(
            and(
              eq(ingress.webhookEvents.status, 'pending'),
              lte(ingress.webhookEvents.availableAt, now),
            ),
            and(
              eq(ingress.webhookEvents.status, 'processing'),
              lte(ingress.webhookEvents.leaseExpiresAt, now),
            ),
          ),
        )
        .orderBy(asc(ingress.webhookEvents.receivedAt))
        .limit(command.limit)
        .for('update', { skipLocked: true });
      const claimed: ClaimedWebhookEvent[] = [];

      for (const event of claimable) {
        if (
          event.payload === null ||
          !isJsonValue(event.payload) ||
          event.payloadHash === null
        )
          throw invariantViolationError({
            code: 'webhook_claimable_event_payload_missing',
            message: 'A claimable webhook event has no payload.',
            safeMessage: 'Stored webhook event data is inconsistent.',
          });

        const attempt = event.attempts + 1;
        const recoveredLease = event.status === 'processing';
        await transaction
          .update(ingress.webhookEvents)
          .set({
            status: 'processing',
            attempts: attempt,
            leaseOwner: command.workerId,
            leaseExpiresAt: new Date(now.getTime() + command.leaseMs),
          })
          .where(eq(ingress.webhookEvents.id, event.id));
        claimed.push({
          eventId: event.id,
          workerId: command.workerId,
          attempt,
          source: event.source,
          eventType: event.eventType,
          subjectType: event.subjectType,
          subjectId: event.subjectId,
          sourceLocationId: event.sourceLocationId,
          sourceOccurredAt: event.sourceOccurredAt,
          receivedAt: event.receivedAt,
          payload: event.payload,
          payloadHash: event.payloadHash,
          recoveredLease,
        });
      }
      return Object.freeze(claimed);
    }),
});
