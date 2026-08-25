import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type {
  PurgeExpiredWebhookReceiptsClock,
  PurgeExpiredWebhookReceiptsExpectedFailure,
  PurgeExpiredWebhookReceiptsInput,
  PurgeExpiredWebhookReceiptsRepository,
  PurgeExpiredWebhookReceiptsResult,
} from './types.ts';

export type PurgeExpiredWebhookReceiptsDependencies = Readonly<{
  repo: PurgeExpiredWebhookReceiptsRepository;
  clock: PurgeExpiredWebhookReceiptsClock;
}>;

export const makeExecutePurgeExpiredWebhookReceipts =
  (deps: PurgeExpiredWebhookReceiptsDependencies) =>
  async (
    _input: PurgeExpiredWebhookReceiptsInput,
  ): Promise<
    CellOutcome<
      PurgeExpiredWebhookReceiptsResult,
      PurgeExpiredWebhookReceiptsExpectedFailure
    >
  > => {
    try {
      return {
        kind: 'success',
        value: { purgedCount: await deps.repo.purge(deps.clock.now()) },
      };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'webhook_quarantine_purge_failed',
          message: 'Expired webhook diagnostic receipts could not be removed.',
          safeMessage:
            'Expired webhook diagnostic receipts could not be removed.',
          status: 503,
          cause,
        }),
      );
    }
  };
