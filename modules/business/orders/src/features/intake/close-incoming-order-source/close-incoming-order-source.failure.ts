export type CloseIncomingOrderSourceFailure = Readonly<{
  kind: 'validation';
  code: 'incoming_order_source_close_invalid';
  message: string;
}>;

export const closeIncomingOrderSourceFailure = Object.freeze({
  invalid: (): CloseIncomingOrderSourceFailure => ({
    kind: 'validation',
    code: 'incoming_order_source_close_invalid',
    message: 'The incoming source-terminal observation is invalid.',
  }),
});
