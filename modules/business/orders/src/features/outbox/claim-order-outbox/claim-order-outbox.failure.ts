export type ClaimOrderOutboxFailure = Readonly<{
  kind: 'validation';
  code: 'order_outbox_claim_invalid';
  message: string;
}>;

export const claimOrderOutboxFailure = Object.freeze({
  invalid: (): ClaimOrderOutboxFailure => ({
    kind: 'validation',
    code: 'order_outbox_claim_invalid',
    message: 'The outbox claim request is invalid.',
  }),
});
