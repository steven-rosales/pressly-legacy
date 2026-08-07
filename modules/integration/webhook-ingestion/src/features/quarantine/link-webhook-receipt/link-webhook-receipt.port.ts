import type { Result } from '@pressly/kernel';
import type { LinkWebhookReceiptFailure } from './link-webhook-receipt.failure.ts';

export type LinkWebhookReceipt = (command: {
  receiptId: string;
  eventId: string;
}) => Promise<Result<Readonly<{ linked: boolean }>, LinkWebhookReceiptFailure>>;

export type LinkWebhookReceiptRepository = (input: {
  receiptId: string;
  eventId: string;
  linkedAt: Date;
}) => Promise<'linked' | 'already_linked' | 'missing' | 'conflict'>;
