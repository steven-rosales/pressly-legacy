export type ProposeIncomingOrderFailure = Readonly<{
  kind: 'validation';
  code: 'incoming_order_proposal_invalid';
  message: string;
}>;

export const proposeIncomingOrderFailure = Object.freeze({
  invalid: (): ProposeIncomingOrderFailure => ({
    kind: 'validation',
    code: 'incoming_order_proposal_invalid',
    message:
      'The incoming Order candidate is incomplete or is not an exact submitted Order.',
  }),
});
