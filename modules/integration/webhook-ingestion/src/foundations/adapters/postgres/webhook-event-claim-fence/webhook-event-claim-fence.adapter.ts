import { and, eq } from '@pressly/db/query';
import * as webhookIngestion from '@pressly/db/schema/webhook-ingestion';

export const webhookEventClaimPredicate = (input: {
  eventId: string;
  workerId: string;
  attempt: number;
}) =>
  and(
    eq(webhookIngestion.webhookEvents.id, input.eventId),
    eq(webhookIngestion.webhookEvents.status, 'processing'),
    eq(webhookIngestion.webhookEvents.leaseOwner, input.workerId),
    eq(webhookIngestion.webhookEvents.attempts, input.attempt),
  );
