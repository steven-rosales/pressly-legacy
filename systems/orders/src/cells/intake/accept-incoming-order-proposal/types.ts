import type { IncomingOrderProposalDecisionCommand } from '../../../model/incoming-order-proposal/model.ts';

export type AcceptIncomingOrderProposalCommand =
  IncomingOrderProposalDecisionCommand<'incoming_order_accepted'>;

export type AcceptIncomingOrderProposalExpectedFailure =
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
        | 'canonical_source_user_business_conflict'
        | 'user_idempotency_conflict';
      message: string;
    }>;
