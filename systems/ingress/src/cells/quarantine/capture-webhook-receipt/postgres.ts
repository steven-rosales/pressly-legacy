import type { PostgresDatabase } from '@pressly/postgres/client';
import { and, eq } from '@pressly/postgres/query';
import { invariantViolationError } from '@pressly/errors/factories';
import type { IngressSchema } from '../../../schema/ingress.ts';
import type { CaptureWebhookReceiptRepository } from './types.ts';

export const makeCaptureWebhookReceiptPostgresRepository = (
  db: PostgresDatabase,
  ingress: Pick<IngressSchema, 'webhookReceiptQuarantine'>,
): CaptureWebhookReceiptRepository => ({
  capture: async ({ receiptId, receipt, receivedAt, expiresAt }) => {
    const rejected = receipt.normalization.outcome === 'rejected';
    const [inserted] = await db
      .insert(ingress.webhookReceiptQuarantine)
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
          ingress.webhookReceiptQuarantine.source,
          ingress.webhookReceiptQuarantine.rawBodySha256,
          ingress.webhookReceiptQuarantine.adapterVersion,
        ],
      })
      .returning({ id: ingress.webhookReceiptQuarantine.id });
    if (inserted !== undefined)
      return { receiptId: inserted.id, duplicate: false };

    const [existing] = await db
      .select({
        id: ingress.webhookReceiptQuarantine.id,
        eventType: ingress.webhookReceiptQuarantine.eventType,
        normalizationOutcome:
          ingress.webhookReceiptQuarantine.normalizationOutcome,
        normalizationErrorCode:
          ingress.webhookReceiptQuarantine.normalizationErrorCode,
      })
      .from(ingress.webhookReceiptQuarantine)
      .where(
        and(
          eq(ingress.webhookReceiptQuarantine.source, receipt.source),
          eq(
            ingress.webhookReceiptQuarantine.rawBodySha256,
            receipt.rawBodySha256,
          ),
          eq(
            ingress.webhookReceiptQuarantine.adapterVersion,
            receipt.adapterVersion,
          ),
        ),
      )
      .limit(1);
    if (existing === undefined)
      throw invariantViolationError({
        code: 'webhook_quarantine_insert_result_missing',
        message: 'Webhook quarantine insert raced and vanished.',
        safeMessage: 'Stored webhook quarantine data is inconsistent.',
      });
    if (
      existing.eventType !== receipt.eventType ||
      existing.normalizationOutcome !== receipt.normalization.outcome ||
      existing.normalizationErrorCode !==
        (rejected ? receipt.normalization.errorCode : null)
    )
      throw invariantViolationError({
        code: 'webhook_quarantine_duplicate_diverged',
        message: 'Duplicate webhook quarantine receipt diverged.',
        safeMessage: 'Stored webhook quarantine data is inconsistent.',
      });
    return { receiptId: existing.id, duplicate: true };
  },
});
