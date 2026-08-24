import type { PostgresDatabase } from '@pressly/postgres/client';
import { and, eq, isNull } from '@pressly/postgres/query';
import type { IngressSchema } from '../../../schema/ingress.ts';
import type { LinkWebhookReceiptRepository } from './types.ts';

export const makeLinkWebhookReceiptPostgresRepository = (
  db: PostgresDatabase,
  ingress: Pick<IngressSchema, 'webhookReceiptQuarantine'>,
): LinkWebhookReceiptRepository => ({
  link: async ({ receiptId, eventId, linkedAt }) => {
    const [same] = await db
      .update(ingress.webhookReceiptQuarantine)
      .set({ webhookEventId: eventId, linkedAt })
      .where(
        and(
          eq(ingress.webhookReceiptQuarantine.id, receiptId),
          eq(ingress.webhookReceiptQuarantine.normalizationOutcome, 'accepted'),
          eq(ingress.webhookReceiptQuarantine.webhookEventId, eventId),
        ),
      )
      .returning({ id: ingress.webhookReceiptQuarantine.id });
    if (same !== undefined) return 'already_linked';

    const [linked] = await db
      .update(ingress.webhookReceiptQuarantine)
      .set({ webhookEventId: eventId, linkedAt })
      .where(
        and(
          eq(ingress.webhookReceiptQuarantine.id, receiptId),
          eq(ingress.webhookReceiptQuarantine.normalizationOutcome, 'accepted'),
          isNull(ingress.webhookReceiptQuarantine.webhookEventId),
        ),
      )
      .returning({ id: ingress.webhookReceiptQuarantine.id });
    if (linked !== undefined) return 'linked';

    const [existing] = await db
      .select({ eventId: ingress.webhookReceiptQuarantine.webhookEventId })
      .from(ingress.webhookReceiptQuarantine)
      .where(eq(ingress.webhookReceiptQuarantine.id, receiptId))
      .limit(1);
    if (existing === undefined) return 'missing';
    return existing.eventId === eventId ? 'already_linked' : 'conflict';
  },
});
