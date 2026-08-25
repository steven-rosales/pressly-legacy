import { bindCell, declareCommandCell } from '@pressly/cells';
import { purgeExpiredWebhookReceiptsContract } from './contract.ts';
import {
  makeExecutePurgeExpiredWebhookReceipts,
  type PurgeExpiredWebhookReceiptsDependencies,
} from './execute.ts';
import {
  purgeExpiredWebhookReceiptsOperationId,
  type PurgeExpiredWebhookReceiptsExpectedFailure,
  type PurgeExpiredWebhookReceiptsInput,
  type PurgeExpiredWebhookReceiptsResult,
} from './types.ts';

export const purgeExpiredWebhookReceiptsCellDeclaration = declareCommandCell<
  PurgeExpiredWebhookReceiptsInput,
  PurgeExpiredWebhookReceiptsResult,
  PurgeExpiredWebhookReceiptsExpectedFailure
>({
  id: purgeExpiredWebhookReceiptsOperationId,
  authentication: 'none',
  contract: purgeExpiredWebhookReceiptsContract,
  consistency: { transaction: 'required', concurrency: 'none' },
  idempotency: { required: false },
  surfaces: [],
  emits: [],
  consumes: [],
  observability: { operation: 'ingress.purge_expired_webhook_receipts' },
});

export const makePurgeExpiredWebhookReceiptsCell = (
  deps: PurgeExpiredWebhookReceiptsDependencies,
) =>
  bindCell(
    purgeExpiredWebhookReceiptsCellDeclaration,
    makeExecutePurgeExpiredWebhookReceipts(deps),
  );
