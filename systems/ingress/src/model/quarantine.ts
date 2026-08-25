export const defaultWebhookQuarantineRetentionMs = 30 * 24 * 60 * 60 * 1_000;

export type WebhookReceiptNormalization =
  | Readonly<{ outcome: 'accepted' }>
  | Readonly<{ outcome: 'rejected'; errorCode: string }>;

export type CaptureWebhookReceiptCommand = Readonly<{
  source: string;
  rawBodySha256: string;
  adapterVersion: string;
  eventType: string | null;
  payloadCiphertext: string;
  normalization: WebhookReceiptNormalization;
}>;

export type CaptureWebhookReceiptResult = Readonly<{
  receiptId: string;
  duplicate: boolean;
}>;
