import {
  and,
  eq,
  isNull,
  lte,
  webhookIngestion,
  type Database,
} from '@pressly/db';
import { invariantViolationError, type AppError } from '@pressly/errors';
import type { QuarantineWebhookReceiptsRepository } from './quarantine-receipts.port.ts';

const quarantineInvariant = (code: string, message: string): AppError =>
  invariantViolationError({
    code: code.toLowerCase(),
    message,
    safeMessage: 'Stored webhook quarantine data is inconsistent.',
  });

export const makeQuarantineWebhookReceiptsRepository = (
  db: Database,
): QuarantineWebhookReceiptsRepository => ({
  capture: async ({ receiptId, command, receivedAt, expiresAt }) => {
    const rejected = command.normalization.outcome === 'rejected';
    const [inserted] = await db
      .insert(webhookIngestion.webhookReceiptQuarantine)
      .values({
        id: receiptId,
        source: command.source,
        rawBodySha256: command.rawBodySha256,
        adapterVersion: command.adapterVersion,
        eventType: command.eventType,
        normalizationOutcome: command.normalization.outcome,
        normalizationErrorCode: rejected
          ? command.normalization.errorCode
          : null,
        payloadCiphertext: command.payloadCiphertext,
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
          eq(webhookIngestion.webhookReceiptQuarantine.source, command.source),
          eq(
            webhookIngestion.webhookReceiptQuarantine.rawBodySha256,
            command.rawBodySha256,
          ),
          eq(
            webhookIngestion.webhookReceiptQuarantine.adapterVersion,
            command.adapterVersion,
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
      existing.eventType !== command.eventType ||
      existing.normalizationOutcome !== command.normalization.outcome ||
      existing.normalizationErrorCode !==
        (rejected ? command.normalization.errorCode : null)
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
