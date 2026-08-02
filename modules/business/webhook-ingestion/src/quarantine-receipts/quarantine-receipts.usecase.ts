import {
  conflictError,
  databaseError,
  mapUnknownError,
  notFoundError,
  type AppError,
} from '@pressly/errors';
import { result } from '@pressly/kernel';
import type {
  WebhookIngestionClockPort,
  WebhookIngestionIdPort,
} from '../ingestion/webhook-ingestion.port.ts';
import type {
  CaptureWebhookReceipt,
  LinkWebhookReceipt,
  PurgeExpiredWebhookReceipts,
  QuarantineWebhookReceiptsRepository,
} from './quarantine-receipts.port.ts';

export const DEFAULT_WEBHOOK_QUARANTINE_RETENTION_MS =
  30 * 24 * 60 * 60 * 1_000;

const quarantineDatabaseFailure = (
  code: string,
  message: string,
  cause: unknown,
): AppError =>
  mapUnknownError(cause, (unknownCause) =>
    databaseError({
      code,
      message,
      safeMessage: message,
      status: 503,
      cause: unknownCause,
    }),
  );

export const makeCaptureWebhookReceipt =
  (deps: {
    repo: QuarantineWebhookReceiptsRepository;
    clock: WebhookIngestionClockPort;
    ids: WebhookIngestionIdPort;
    retentionMs: number;
  }): CaptureWebhookReceipt =>
  async (command) => {
    try {
      const receivedAt = deps.clock.now();
      return result.ok(
        await deps.repo.capture({
          receiptId: deps.ids.next(),
          command,
          receivedAt,
          expiresAt: new Date(receivedAt.getTime() + deps.retentionMs),
        }),
      );
    } catch (error) {
      return result.err(
        quarantineDatabaseFailure(
          'webhook_quarantine_capture_failed',
          'The webhook diagnostic receipt could not be stored durably.',
          error,
        ),
      );
    }
  };

export const makeLinkWebhookReceipt =
  (deps: {
    repo: QuarantineWebhookReceiptsRepository;
    clock: WebhookIngestionClockPort;
  }): LinkWebhookReceipt =>
  async (command) => {
    try {
      const outcome = await deps.repo.link({
        ...command,
        linkedAt: deps.clock.now(),
      });
      if (outcome === 'missing')
        return result.err(
          notFoundError({
            code: 'webhook_quarantine_receipt_not_found',
            message: 'The webhook diagnostic receipt was not found.',
            safeMessage: 'The webhook diagnostic receipt was not found.',
          }),
        );
      if (outcome === 'conflict')
        return result.err(
          conflictError({
            code: 'webhook_quarantine_link_conflict',
            message:
              'The webhook diagnostic receipt is linked to another event.',
            safeMessage:
              'The webhook diagnostic receipt is linked to another event.',
          }),
        );
      return result.ok({ linked: outcome === 'linked' });
    } catch (error) {
      return result.err(
        quarantineDatabaseFailure(
          'webhook_quarantine_link_failed',
          'The webhook diagnostic receipt could not be linked.',
          error,
        ),
      );
    }
  };

export const makePurgeExpiredWebhookReceipts =
  (deps: {
    repo: QuarantineWebhookReceiptsRepository;
    clock: WebhookIngestionClockPort;
  }): PurgeExpiredWebhookReceipts =>
  async () => {
    try {
      return result.ok({
        purgedCount: await deps.repo.purgeExpired(deps.clock.now()),
      });
    } catch (error) {
      return result.err(
        quarantineDatabaseFailure(
          'webhook_quarantine_purge_failed',
          'Expired webhook diagnostic receipts could not be removed.',
          error,
        ),
      );
    }
  };
