export type ListIncomingOrderProposalsFailure = Readonly<{
  kind: 'validation';
  code:
    | 'incoming_order_proposal_query_invalid'
    | 'incoming_order_proposal_cursor_invalid';
  message: string;
}>;

export const listIncomingOrderProposalsFailure = Object.freeze({
  invalidQuery: (): ListIncomingOrderProposalsFailure => ({
    kind: 'validation',
    code: 'incoming_order_proposal_query_invalid',
    message: 'The incoming Order proposal query is invalid.',
  }),
  invalidCursor: (): ListIncomingOrderProposalsFailure => ({
    kind: 'validation',
    code: 'incoming_order_proposal_cursor_invalid',
    message: 'The incoming Order proposal cursor is invalid.',
  }),
});
