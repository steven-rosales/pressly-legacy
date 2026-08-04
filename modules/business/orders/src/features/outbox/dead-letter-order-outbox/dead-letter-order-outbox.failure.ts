export type DeadLetterOrderOutboxFailure = Readonly<{
  kind: 'validation';
  code: 'order_outbox_dead_letter_invalid';
  message: string;
}>;

export const deadLetterOrderOutboxFailure = Object.freeze({
  invalid: (): DeadLetterOrderOutboxFailure => ({
    kind: 'validation',
    code: 'order_outbox_dead_letter_invalid',
    message: 'The outbox dead-letter request is invalid.',
  }),
});
