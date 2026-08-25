import type {
  CaptureWebhookReceiptCommand,
  CaptureWebhookReceiptResult,
} from '../../../model/quarantine.ts';

export const captureWebhookReceiptOperationId =
  'ingress.capture-webhook-receipt.v1' as const;
export type CaptureWebhookReceiptExpectedFailure = never;
export type CaptureWebhookReceiptRepository = Readonly<{
  capture: (input: {
    receiptId: string;
    receipt: CaptureWebhookReceiptCommand;
    receivedAt: Date;
    expiresAt: Date;
  }) => Promise<CaptureWebhookReceiptResult>;
}>;
export type CaptureWebhookReceiptClock = Readonly<{ now: () => Date }>;
export type CaptureWebhookReceiptIdSource = Readonly<{ next: () => string }>;
