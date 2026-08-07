export type IncomingOrderProposalCustomerFailure = Readonly<{
  kind: 'conflict';
  code: 'canonical_source_user_business_conflict' | 'user_idempotency_conflict';
}>;

export type AcceptIncomingOrderProposalFailure =
  | Readonly<{
      kind: 'validation';
      code: 'incoming_order_proposal_accept_invalid';
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
        | 'incoming_order_proposal_identity_conflict'
        | 'order_idempotency_conflict'
        | IncomingOrderProposalCustomerFailure['code'];
      message: string;
    }>;

export const acceptIncomingOrderProposalFailure = Object.freeze({
  invalid: (): AcceptIncomingOrderProposalFailure => ({
    kind: 'validation',
    code: 'incoming_order_proposal_accept_invalid',
    message: 'The incoming Order acceptance is incomplete.',
  }),
  notFound: (): AcceptIncomingOrderProposalFailure => ({
    kind: 'not_found',
    code: 'incoming_order_proposal_not_found',
    message: 'The incoming Order proposal was not found.',
  }),
  versionConflict: (): AcceptIncomingOrderProposalFailure => ({
    kind: 'conflict',
    code: 'incoming_order_proposal_version_conflict',
    message:
      'The incoming Order proposal changed after this request was prepared.',
  }),
  invalidTransition: (): AcceptIncomingOrderProposalFailure => ({
    kind: 'conflict',
    code: 'incoming_order_proposal_transition_invalid',
    message: 'The incoming Order proposal has already been decided.',
  }),
  identityConflict: (): AcceptIncomingOrderProposalFailure => ({
    kind: 'conflict',
    code: 'incoming_order_proposal_identity_conflict',
    message: 'This exact source Order is already linked to Pressly.',
  }),
  idempotencyConflict: (): AcceptIncomingOrderProposalFailure => ({
    kind: 'conflict',
    code: 'order_idempotency_conflict',
    message: 'The idempotency key belongs to a different Order command.',
  }),
  customerResolution: (
    failure: IncomingOrderProposalCustomerFailure,
  ): AcceptIncomingOrderProposalFailure =>
    failure.code === 'canonical_source_user_business_conflict'
      ? {
          kind: 'conflict',
          code: failure.code,
          message:
            'The source customer is already associated with another business.',
        }
      : {
          kind: 'conflict',
          code: failure.code,
          message:
            'The customer idempotency key belongs to another user command.',
        },
});
