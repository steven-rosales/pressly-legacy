import { result } from '@pressly/kernel';
import { webhookIngestionError } from '../webhook-ingestion.error.ts';
import type {
  WebhookIngestionClockPort,
  WebhookIngestionIdPort,
} from '../webhook-ingestion.port.ts';
import type {
  CaptureWebhookReceipt,
  LinkWebhookReceipt,
  PurgeExpiredWebhookReceipts,
  QuarantineWebhookReceiptsRepository,
} from './quarantine-receipts.port.ts';

export const DEFAULT_WEBHOOK_QUARANTINE_RETENTION_MS =
  30 * 24 * 60 * 60 * 1_000;

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
        webhookIngestionError(
          'WEBHOOK_QUARANTINE_CAPTURE_FAILED',
          'The webhook diagnostic receipt could not be stored durably.',
          503,
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
          webhookIngestionError(
            'WEBHOOK_QUARANTINE_RECEIPT_NOT_FOUND',
            'The webhook diagnostic receipt was not found.',
            503,
          ),
        );
      if (outcome === 'conflict')
        return result.err(
          webhookIngestionError(
            'WEBHOOK_QUARANTINE_LINK_CONFLICT',
            'The webhook diagnostic receipt is linked to another event.',
            503,
          ),
        );
      return result.ok({ linked: outcome === 'linked' });
    } catch (error) {
      return result.err(
        webhookIngestionError(
          'WEBHOOK_QUARANTINE_LINK_FAILED',
          'The webhook diagnostic receipt could not be linked.',
          503,
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
        webhookIngestionError(
          'WEBHOOK_QUARANTINE_PURGE_FAILED',
          'Expired webhook diagnostic receipts could not be removed.',
          503,
          error,
        ),
      );
    }
  };
