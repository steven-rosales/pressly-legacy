import type { LinkWebhookReceiptExpectedFailure } from './types.ts';

export const linkWebhookReceiptFailure = Object.freeze({
  notFound: (): LinkWebhookReceiptExpectedFailure => ({
    kind: 'not_found',
    code: 'webhook_quarantine_receipt_not_found',
    message: 'The webhook diagnostic receipt was not found.',
    safeMessage: 'The webhook diagnostic receipt was not found.',
  }),
  conflict: (): LinkWebhookReceiptExpectedFailure => ({
    kind: 'conflict',
    code: 'webhook_quarantine_link_conflict',
    message: 'The webhook diagnostic receipt is linked to another event.',
    safeMessage: 'The webhook diagnostic receipt is linked to another event.',
  }),
});
