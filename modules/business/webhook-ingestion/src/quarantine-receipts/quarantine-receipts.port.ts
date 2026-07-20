import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';

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

export type CaptureWebhookReceipt = (
  command: CaptureWebhookReceiptCommand,
) => Promise<Result<CaptureWebhookReceiptResult, AppError>>;

export type LinkWebhookReceipt = (command: {
  receiptId: string;
  eventId: string;
}) => Promise<Result<Readonly<{ linked: boolean }>, AppError>>;

export type PurgeExpiredWebhookReceipts = () => Promise<
  Result<Readonly<{ purgedCount: number }>, AppError>
>;

export type QuarantineWebhookReceiptsRepository = Readonly<{
  capture: (input: {
    receiptId: string;
    command: CaptureWebhookReceiptCommand;
    receivedAt: Date;
    expiresAt: Date;
  }) => Promise<CaptureWebhookReceiptResult>;
  link: (input: {
    receiptId: string;
    eventId: string;
    linkedAt: Date;
  }) => Promise<'linked' | 'already_linked' | 'missing' | 'conflict'>;
  purgeExpired: (expiresAtOrBefore: Date) => Promise<number>;
}>;
