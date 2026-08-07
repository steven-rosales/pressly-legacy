export type LinkWebhookReceiptFailure = Readonly<{
  code:
    | 'webhook_quarantine_receipt_not_found'
    | 'webhook_quarantine_link_conflict';
  message: string;
}>;

export const linkWebhookReceiptFailure = Object.freeze({
  notFound: (): LinkWebhookReceiptFailure => ({
    code: 'webhook_quarantine_receipt_not_found',
    message: 'The webhook diagnostic receipt was not found.',
  }),
  conflict: (): LinkWebhookReceiptFailure => ({
    code: 'webhook_quarantine_link_conflict',
    message: 'The webhook diagnostic receipt is linked to another event.',
  }),
});
