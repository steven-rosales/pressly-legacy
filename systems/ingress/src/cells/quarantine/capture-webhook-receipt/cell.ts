import { defineOperation } from '@pressly/cells';
import type {
  CaptureWebhookReceiptCommand,
  CaptureWebhookReceiptResult,
} from '../../../model/quarantine.ts';
import { captureWebhookReceiptContract } from './contract.ts';
import {
  makeExecuteCaptureWebhookReceipt,
  type CaptureWebhookReceiptDependencies,
} from './execute.ts';
import {
  captureWebhookReceiptOperationId,
  type CaptureWebhookReceiptExpectedFailure,
} from './types.ts';

export const captureWebhookReceiptCellDeclaration = defineOperation<
  CaptureWebhookReceiptCommand,
  CaptureWebhookReceiptResult,
  CaptureWebhookReceiptExpectedFailure
>({
  kind: 'command',
  id: captureWebhookReceiptOperationId,
  authentication: 'none',
  contract: captureWebhookReceiptContract,
  consistency: {
    transaction: 'required',
    concurrency: 'partitioned',
    concurrencyKey: (input) =>
      `${input.source}:${input.rawBodySha256}:${input.adapterVersion}`,
  },
  idempotency: {
    required: true,
    key: (input) =>
      `${input.source}:${input.rawBodySha256}:${input.adapterVersion}`,
    fingerprint: (input) =>
      `${input.eventType ?? ''}:${input.normalization.outcome}:${
        input.normalization.outcome === 'rejected'
          ? input.normalization.errorCode
          : ''
      }`,
  },
  surfaces: [],
  emits: [],
  consumes: [],
  observability: { operation: 'ingress.capture_webhook_receipt' },
});

export const makeCaptureWebhookReceiptCell = (
  deps: CaptureWebhookReceiptDependencies,
) =>
  defineOperation(
    captureWebhookReceiptCellDeclaration,
    makeExecuteCaptureWebhookReceipt(deps),
  );
