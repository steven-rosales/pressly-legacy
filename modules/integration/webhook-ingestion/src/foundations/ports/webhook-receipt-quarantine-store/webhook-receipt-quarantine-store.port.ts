import type {
  CapturedWebhookReceipt,
  WebhookReceiptCapture,
} from '../../language/quarantine-receipts/webhook-receipt-quarantine.model.ts';

export type WebhookReceiptQuarantineStore = Readonly<{
  capture: (input: {
    receiptId: string;
    receipt: WebhookReceiptCapture;
    receivedAt: Date;
    expiresAt: Date;
  }) => Promise<CapturedWebhookReceipt>;
  link: (input: {
    receiptId: string;
    eventId: string;
    linkedAt: Date;
  }) => Promise<'linked' | 'already_linked' | 'missing' | 'conflict'>;
  purgeExpired: (expiresAtOrBefore: Date) => Promise<number>;
}>;
