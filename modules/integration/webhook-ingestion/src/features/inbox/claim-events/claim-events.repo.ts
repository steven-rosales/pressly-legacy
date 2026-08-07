import { isJsonValue } from '@pressly/codec';
import type { Database } from '@pressly/db/client';
import { and, asc, eq, lte, or } from '@pressly/db/query';
import * as webhookIngestion from '@pressly/db/schema/webhook-ingestion';
import type { AppError } from '@pressly/errors/app-error';
import { invariantViolationError } from '@pressly/errors/factories';
import type { ClaimedWebhookEvent } from '../../../foundations/language/inbox/webhook-inbox.model.ts';
import type { ClaimWebhookEventsRepository } from './claim-events.port.ts';

const claimableEventInvariant = (code: string, message: string): AppError =>
  invariantViolationError({
    code: code.toLowerCase(),
    message,
    safeMessage: 'Stored webhook event data is inconsistent.',
  });

export const makePostgresClaimWebhookEventsRepository =
  (db: Database): ClaimWebhookEventsRepository =>
  ({ workerId, now, leaseMs, limit }) =>
    db.transaction(async (transaction) => {
      const claimable = await transaction
        .select()
        .from(webhookIngestion.webhookEvents)
        .where(
          or(
            and(
              eq(webhookIngestion.webhookEvents.status, 'pending'),
              lte(webhookIngestion.webhookEvents.availableAt, now),
            ),
            and(
              eq(webhookIngestion.webhookEvents.status, 'processing'),
              lte(webhookIngestion.webhookEvents.leaseExpiresAt, now),
            ),
          ),
        )
        .orderBy(asc(webhookIngestion.webhookEvents.receivedAt))
        .limit(limit)
        .for('update', { skipLocked: true });
      const claimed: ClaimedWebhookEvent[] = [];

      for (const event of claimable) {
        if (
          event.payload === null ||
          !isJsonValue(event.payload) ||
          event.payloadHash === null
        )
          throw claimableEventInvariant(
            'WEBHOOK_CLAIMABLE_EVENT_PAYLOAD_MISSING',
            'A claimable webhook event has no payload.',
          );

        const attempt = event.attempts + 1;
        const recoveredLease = event.status === 'processing';
        await transaction
          .update(webhookIngestion.webhookEvents)
          .set({
            status: 'processing',
            attempts: attempt,
            leaseOwner: workerId,
            leaseExpiresAt: new Date(now.getTime() + leaseMs),
          })
          .where(eq(webhookIngestion.webhookEvents.id, event.id));
        claimed.push({
          eventId: event.id,
          workerId,
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

      return claimed;
    });
