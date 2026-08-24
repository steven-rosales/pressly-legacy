export const linkWebhookReceiptOperationId =
  'ingress.link-webhook-receipt.v1' as const;
export type LinkWebhookReceiptCommand = Readonly<{
  receiptId: string;
  eventId: string;
}>;
export type LinkWebhookReceiptResult = Readonly<{ linked: boolean }>;
export type LinkWebhookReceiptExpectedFailure = Readonly<{
  kind: 'not_found' | 'conflict';
  code:
    | 'webhook_quarantine_receipt_not_found'
    | 'webhook_quarantine_link_conflict';
  message: string;
  safeMessage: string;
}>;
export type LinkWebhookReceiptRepository = Readonly<{
  link: (
    input: LinkWebhookReceiptCommand & { linkedAt: Date },
  ) => Promise<'linked' | 'already_linked' | 'missing' | 'conflict'>;
}>;
export type LinkWebhookReceiptClock = Readonly<{ now: () => Date }>;
