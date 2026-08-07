import { mapUnknownError, type AppError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { result, type IdSource } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import type {
  CaptureWebhookReceipt,
  CaptureWebhookReceiptRepository,
} from './capture-webhook-receipt.port.ts';

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
    repo: CaptureWebhookReceiptRepository;
    clock: Clock;
    ids: IdSource;
    retentionMs: number;
  }): CaptureWebhookReceipt =>
  async (receipt) => {
    try {
      const receivedAt = deps.clock.now();
      return result.ok(
        await deps.repo({
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
