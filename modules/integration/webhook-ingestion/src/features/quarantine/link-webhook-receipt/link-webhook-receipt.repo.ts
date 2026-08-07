import type { Database } from '@pressly/db/client';
import { and, eq, isNull } from '@pressly/db/query';
import * as webhookIngestion from '@pressly/db/schema/webhook-ingestion';
import type { LinkWebhookReceiptRepository } from './link-webhook-receipt.port.ts';

export const makePostgresLinkWebhookReceiptRepository =
  (db: Database): LinkWebhookReceiptRepository =>
  async ({ receiptId, eventId, linkedAt }) => {
    const [updated] = await db
      .update(webhookIngestion.webhookReceiptQuarantine)
      .set({ webhookEventId: eventId, linkedAt })
      .where(
        and(
          eq(webhookIngestion.webhookReceiptQuarantine.id, receiptId),
          eq(
            webhookIngestion.webhookReceiptQuarantine.normalizationOutcome,
            'accepted',
          ),
          eq(webhookIngestion.webhookReceiptQuarantine.webhookEventId, eventId),
        ),
      )
      .returning({ id: webhookIngestion.webhookReceiptQuarantine.id });
    if (updated !== undefined) return 'already_linked';

    const [unlinked] = await db
      .update(webhookIngestion.webhookReceiptQuarantine)
      .set({ webhookEventId: eventId, linkedAt })
      .where(
        and(
          eq(webhookIngestion.webhookReceiptQuarantine.id, receiptId),
          eq(
            webhookIngestion.webhookReceiptQuarantine.normalizationOutcome,
            'accepted',
          ),
          isNull(webhookIngestion.webhookReceiptQuarantine.webhookEventId),
        ),
      )
      .returning({ id: webhookIngestion.webhookReceiptQuarantine.id });
    if (unlinked !== undefined) return 'linked';

    const [existing] = await db
      .select({
        eventId: webhookIngestion.webhookReceiptQuarantine.webhookEventId,
      })
      .from(webhookIngestion.webhookReceiptQuarantine)
      .where(eq(webhookIngestion.webhookReceiptQuarantine.id, receiptId))
      .limit(1);
    if (existing === undefined) return 'missing';
    return existing.eventId === eventId ? 'already_linked' : 'conflict';
  };
