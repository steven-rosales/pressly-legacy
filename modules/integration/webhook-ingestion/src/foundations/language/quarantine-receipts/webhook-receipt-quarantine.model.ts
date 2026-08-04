export type WebhookReceiptNormalization =
  | Readonly<{ outcome: 'accepted' }>
  | Readonly<{ outcome: 'rejected'; errorCode: string }>;

export type WebhookReceiptCapture = Readonly<{
  source: string;
  rawBodySha256: string;
  adapterVersion: string;
  eventType: string | null;
  payloadCiphertext: string;
  normalization: WebhookReceiptNormalization;
}>;

export type CapturedWebhookReceipt = Readonly<{
  receiptId: string;
  duplicate: boolean;
}>;
