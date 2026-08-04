import type {
  CapturedWebhookReceipt,
  WebhookReceiptCapture,
} from '../../../foundations/language/quarantine-receipts/webhook-receipt-quarantine.model.ts';

export type CaptureWebhookReceiptCommand = WebhookReceiptCapture;
export type CaptureWebhookReceiptResult = CapturedWebhookReceipt;
