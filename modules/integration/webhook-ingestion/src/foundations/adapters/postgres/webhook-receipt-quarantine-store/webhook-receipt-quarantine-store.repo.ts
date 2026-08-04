import { type Database } from '@pressly/db/client';
import { and, eq, isNull, lte } from '@pressly/db/query';
import * as webhookIngestion from '@pressly/db/schema/webhook-ingestion';
import { type AppError } from '@pressly/errors/app-error';
import { invariantViolationError } from '@pressly/errors/factories';
import type { WebhookReceiptQuarantineStore } from '../../../ports/webhook-receipt-quarantine-store/webhook-receipt-quarantine-store.port.ts';

const quarantineInvariant = (code: string, message: string): AppError =>
  invariantViolationError({
    code: code.toLowerCase(),
    message,
    safeMessage: 'Stored webhook quarantine data is inconsistent.',
  });

export const makePostgresWebhookReceiptQuarantineStore = (
  db: Database,
): WebhookReceiptQuarantineStore => ({
  capture: async ({ receiptId, receipt, receivedAt, expiresAt }) => {
    const rejected = receipt.normalization.outcome === 'rejected';
    const [inserted] = await db
      .insert(webhookIngestion.webhookReceiptQuarantine)
      .values({
        id: receiptId,
        source: receipt.source,
        rawBodySha256: receipt.rawBodySha256,
        adapterVersion: receipt.adapterVersion,
        eventType: receipt.eventType,
        normalizationOutcome: receipt.normalization.outcome,
        normalizationErrorCode: rejected
          ? receipt.normalization.errorCode
          : null,
        payloadCiphertext: receipt.payloadCiphertext,
        receivedAt,
        expiresAt,
      })
      .onConflictDoNothing({
        target: [
          webhookIngestion.webhookReceiptQuarantine.source,
          webhookIngestion.webhookReceiptQuarantine.rawBodySha256,
          webhookIngestion.webhookReceiptQuarantine.adapterVersion,
        ],
      })
      .returning({ id: webhookIngestion.webhookReceiptQuarantine.id });
    if (inserted !== undefined)
      return { receiptId: inserted.id, duplicate: false };

    const [existing] = await db
      .select({
        id: webhookIngestion.webhookReceiptQuarantine.id,
        eventType: webhookIngestion.webhookReceiptQuarantine.eventType,
        normalizationOutcome:
          webhookIngestion.webhookReceiptQuarantine.normalizationOutcome,
        normalizationErrorCode:
          webhookIngestion.webhookReceiptQuarantine.normalizationErrorCode,
      })
      .from(webhookIngestion.webhookReceiptQuarantine)
      .where(
        and(
          eq(webhookIngestion.webhookReceiptQuarantine.source, receipt.source),
          eq(
            webhookIngestion.webhookReceiptQuarantine.rawBodySha256,
            receipt.rawBodySha256,
          ),
          eq(
            webhookIngestion.webhookReceiptQuarantine.adapterVersion,
            receipt.adapterVersion,
          ),
        ),
      )
      .limit(1);
    if (existing === undefined)
      throw quarantineInvariant(
        'WEBHOOK_QUARANTINE_INSERT_RESULT_MISSING',
        'Webhook quarantine insert raced and vanished.',
      );
    if (
      existing.eventType !== receipt.eventType ||
      existing.normalizationOutcome !== receipt.normalization.outcome ||
      existing.normalizationErrorCode !==
        (rejected ? receipt.normalization.errorCode : null)
    )
      throw quarantineInvariant(
        'WEBHOOK_QUARANTINE_DUPLICATE_DIVERGED',
        'Duplicate webhook quarantine receipt diverged.',
      );
    return { receiptId: existing.id, duplicate: true };
  },

  link: async ({ receiptId, eventId, linkedAt }) => {
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
  },

  purgeExpired: async (expiresAtOrBefore) => {
    const deleted = await db
      .delete(webhookIngestion.webhookReceiptQuarantine)
      .where(
        lte(
          webhookIngestion.webhookReceiptQuarantine.expiresAt,
          expiresAtOrBefore,
        ),
      )
      .returning({ id: webhookIngestion.webhookReceiptQuarantine.id });
    return deleted.length;
  },
});
