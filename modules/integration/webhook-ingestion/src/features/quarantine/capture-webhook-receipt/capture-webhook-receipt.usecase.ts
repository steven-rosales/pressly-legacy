import { mapUnknownError, type AppError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { result, type IdSource } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import type { WebhookReceiptQuarantineStore } from '../../../foundations/ports/webhook-receipt-quarantine-store/webhook-receipt-quarantine-store.port.ts';
import type { CaptureWebhookReceipt } from './capture-webhook-receipt.port.ts';

export const DEFAULT_WEBHOOK_QUARANTINE_RETENTION_MS =
  30 * 24 * 60 * 60 * 1_000;

const quarantineCaptureFailure = (cause: unknown): AppError =>
  mapUnknownError(cause, (unknownCause) =>
    databaseError({
      code: 'webhook_quarantine_capture_failed',
      message: 'The webhook diagnostic receipt could not be stored durably.',
      safeMessage:
        'The webhook diagnostic receipt could not be stored durably.',
      status: 503,
      cause: unknownCause,
    }),
  );

export const makeCaptureWebhookReceipt =
  (deps: {
    store: WebhookReceiptQuarantineStore;
    clock: Clock;
    ids: IdSource;
    retentionMs: number;
  }): CaptureWebhookReceipt =>
  async (receipt) => {
    try {
      const receivedAt = deps.clock.now();
      return result.ok(
        await deps.store.capture({
          receiptId: deps.ids.next(),
          receipt,
          receivedAt,
          expiresAt: new Date(receivedAt.getTime() + deps.retentionMs),
        }),
      );
    } catch (error) {
      throw quarantineCaptureFailure(error);
    }
  };
