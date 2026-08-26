import { defineOperation } from '@pressly/cells';
import { linkWebhookReceiptContract } from './contract.ts';
import {
  makeExecuteLinkWebhookReceipt,
  type LinkWebhookReceiptDependencies,
} from './execute.ts';
import {
  linkWebhookReceiptOperationId,
  type LinkWebhookReceiptCommand,
  type LinkWebhookReceiptExpectedFailure,
  type LinkWebhookReceiptResult,
} from './types.ts';

export const linkWebhookReceiptCellDeclaration = defineOperation<
  LinkWebhookReceiptCommand,
  LinkWebhookReceiptResult,
  LinkWebhookReceiptExpectedFailure
>({
  kind: 'command',
  id: linkWebhookReceiptOperationId,
  authentication: 'none',
  contract: linkWebhookReceiptContract,
  consistency: {
    transaction: 'required',
    concurrency: 'partitioned',
    concurrencyKey: (input) => input.receiptId,
  },
  idempotency: { required: false },
  surfaces: [],
  emits: [],
  consumes: [],
  observability: { operation: 'ingress.link_webhook_receipt' },
});

export const makeLinkWebhookReceiptCell = (
  deps: LinkWebhookReceiptDependencies,
) =>
  defineOperation(
    linkWebhookReceiptCellDeclaration,
    makeExecuteLinkWebhookReceipt(deps),
  );
