import {
  and,
  asc,
  count,
  eq,
  lte,
  min,
  or,
  webhookIngestion,
  type Database,
} from '@pressly/db';
import { invariantViolationError, type AppError } from '@pressly/errors';
import type {
  ClaimedWebhookEvent,
  ClaimWebhookEventsRepository,
} from './claim-events.port.ts';

const claimableEventInvariant = (code: string, message: string): AppError =>
  invariantViolationError({
    code: code.toLowerCase(),
    message,
    safeMessage: 'Stored webhook event data is inconsistent.',
  });

export const makeClaimWebhookEventsRepository = (
  db: Database,
): ClaimWebhookEventsRepository => ({
  measureBacklog: async (now) => {
    const [backlog] = await db
      .select({
        pendingCount: count(),
        oldestReceivedAt: min(webhookIngestion.webhookEvents.receivedAt),
      })
      .from(webhookIngestion.webhookEvents)
      .where(
        or(
          eq(webhookIngestion.webhookEvents.status, 'pending'),
          eq(webhookIngestion.webhookEvents.status, 'processing'),
        ),
      );
    const oldest = backlog?.oldestReceivedAt;
    return {
      pendingCount: backlog?.pendingCount ?? 0,
      oldestPendingAgeSeconds:
        oldest === null || oldest === undefined
          ? 0
          : Math.max(0, (now.getTime() - oldest.getTime()) / 1_000),
    };
  },

  claim: ({ workerId, now, leaseMs, limit }) =>
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
        if (event.payload === null || event.payloadHash === null)
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
          sourceOccurredAt: event.sourceOccurredAt?.toISOString() ?? null,
          receivedAt: event.receivedAt.toISOString(),
          payload: event.payload,
          payloadHash: event.payloadHash,
          recoveredLease,
        });
      }

      return claimed;
    }),
});
