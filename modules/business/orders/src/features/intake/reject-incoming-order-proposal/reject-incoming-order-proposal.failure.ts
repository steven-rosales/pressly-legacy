export type RejectIncomingOrderProposalFailure =
  | Readonly<{
      kind: 'validation';
      code: 'incoming_order_proposal_reject_invalid';
      message: string;
    }>
  | Readonly<{
      kind: 'not_found';
      code: 'incoming_order_proposal_not_found';
      message: string;
    }>
  | Readonly<{
      kind: 'conflict';
      code:
        | 'incoming_order_proposal_version_conflict'
        | 'incoming_order_proposal_transition_invalid'
        | 'order_idempotency_conflict';
      message: string;
    }>;

export const rejectIncomingOrderProposalFailure = Object.freeze({
  invalid: (): RejectIncomingOrderProposalFailure => ({
    kind: 'validation',
    code: 'incoming_order_proposal_reject_invalid',
    message: 'The incoming Order rejection is incomplete.',
  }),
  notFound: (): RejectIncomingOrderProposalFailure => ({
    kind: 'not_found',
    code: 'incoming_order_proposal_not_found',
    message: 'The incoming Order proposal was not found.',
  }),
  versionConflict: (): RejectIncomingOrderProposalFailure => ({
    kind: 'conflict',
    code: 'incoming_order_proposal_version_conflict',
    message:
      'The incoming Order proposal changed after this request was prepared.',
  }),
  invalidTransition: (): RejectIncomingOrderProposalFailure => ({
    kind: 'conflict',
    code: 'incoming_order_proposal_transition_invalid',
    message: 'The incoming Order proposal has already been decided.',
  }),
  idempotencyConflict: (): RejectIncomingOrderProposalFailure => ({
    kind: 'conflict',
    code: 'order_idempotency_conflict',
    message: 'The idempotency key belongs to a different Order command.',
  }),
});
