import type { Ok } from '@pressly/kernel';
import type {
  CaptureWebhookReceiptCommand,
  CaptureWebhookReceiptResult,
} from './capture-webhook-receipt.model.ts';

export type CaptureWebhookReceipt = (
  command: CaptureWebhookReceiptCommand,
) => Promise<Ok<CaptureWebhookReceiptResult>>;

export type CaptureWebhookReceiptRepository = (input: {
  receiptId: string;
  receipt: CaptureWebhookReceiptCommand;
  receivedAt: Date;
  expiresAt: Date;
}) => Promise<CaptureWebhookReceiptResult>;
