export type RestoreIncomingOrderProposalFailure =
  | Readonly<{
      kind: 'validation';
      code: 'incoming_order_proposal_restore_invalid';
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

export const restoreIncomingOrderProposalFailure = Object.freeze({
  invalid: (): RestoreIncomingOrderProposalFailure => ({
    kind: 'validation',
    code: 'incoming_order_proposal_restore_invalid',
    message: 'The incoming Order restore command is incomplete.',
  }),
  notFound: (): RestoreIncomingOrderProposalFailure => ({
    kind: 'not_found',
    code: 'incoming_order_proposal_not_found',
    message: 'The incoming Order proposal was not found.',
  }),
  versionConflict: (): RestoreIncomingOrderProposalFailure => ({
    kind: 'conflict',
    code: 'incoming_order_proposal_version_conflict',
    message:
      'The incoming Order proposal changed after this request was prepared.',
  }),
  invalidTransition: (): RestoreIncomingOrderProposalFailure => ({
    kind: 'conflict',
    code: 'incoming_order_proposal_transition_invalid',
    message: 'Only a source-closed candidate can be restored.',
  }),
  idempotencyConflict: (): RestoreIncomingOrderProposalFailure => ({
    kind: 'conflict',
    code: 'order_idempotency_conflict',
    message: 'The idempotency key belongs to a different Order command.',
  }),
});
