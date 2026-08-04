import type { Ok } from '@pressly/kernel';
import type {
  CaptureWebhookReceiptCommand,
  CaptureWebhookReceiptResult,
} from './capture-webhook-receipt.model.ts';

export type CaptureWebhookReceipt = (
  command: CaptureWebhookReceiptCommand,
) => Promise<Ok<CaptureWebhookReceiptResult>>;
