import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type {
  CaptureWebhookReceiptCommand,
  CaptureWebhookReceiptResult,
} from '../../../model/quarantine.ts';
import type {
  CaptureWebhookReceiptClock,
  CaptureWebhookReceiptExpectedFailure,
  CaptureWebhookReceiptIdSource,
  CaptureWebhookReceiptRepository,
} from './types.ts';

export type CaptureWebhookReceiptDependencies = Readonly<{
  repo: CaptureWebhookReceiptRepository;
  clock: CaptureWebhookReceiptClock;
  ids: CaptureWebhookReceiptIdSource;
  retentionMs: number;
}>;

export const makeExecuteCaptureWebhookReceipt =
  (deps: CaptureWebhookReceiptDependencies) =>
  async (
    receipt: CaptureWebhookReceiptCommand,
  ): Promise<
    CellOutcome<
      CaptureWebhookReceiptResult,
      CaptureWebhookReceiptExpectedFailure
    >
  > => {
    try {
      const receivedAt = deps.clock.now();
      return {
        kind: 'success',
        value: await deps.repo.capture({
          receiptId: deps.ids.next(),
          receipt,
          receivedAt,
          expiresAt: new Date(receivedAt.getTime() + deps.retentionMs),
        }),
      };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'webhook_quarantine_capture_failed',
          message:
            'The webhook diagnostic receipt could not be stored durably.',
          safeMessage:
            'The webhook diagnostic receipt could not be stored durably.',
          status: 503,
          cause,
        }),
      );
    }
  };
