import { mapUnknownError, type AppError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import type { WebhookReceiptQuarantineStore } from '../../../foundations/ports/webhook-receipt-quarantine-store/webhook-receipt-quarantine-store.port.ts';
import type { PurgeExpiredWebhookReceipts } from './purge-expired-webhook-receipts.port.ts';

const quarantinePurgeFailure = (cause: unknown): AppError =>
  mapUnknownError(cause, (unknownCause) =>
    databaseError({
      code: 'webhook_quarantine_purge_failed',
      message: 'Expired webhook diagnostic receipts could not be removed.',
      safeMessage: 'Expired webhook diagnostic receipts could not be removed.',
      status: 503,
      cause: unknownCause,
    }),
  );

export const makePurgeExpiredWebhookReceipts =
  (deps: {
    store: WebhookReceiptQuarantineStore;
    clock: Clock;
  }): PurgeExpiredWebhookReceipts =>
  async () => {
    try {
      return result.ok({
        purgedCount: await deps.store.purgeExpired(deps.clock.now()),
      });
    } catch (error) {
      throw quarantinePurgeFailure(error);
    }
  };
