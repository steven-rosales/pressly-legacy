import type { IncomingOrderProposalDecisionCommand } from '../../../model/incoming-order-proposal/model.ts';

export type RejectIncomingOrderProposalReasonCode =
  | 'already_handled'
  | 'duplicate_order'
  | 'not_pressly_work'
  | 'manager_rejected';
export type RejectIncomingOrderProposalCommand =
  IncomingOrderProposalDecisionCommand<RejectIncomingOrderProposalReasonCode>;
export type RejectIncomingOrderProposalExpectedFailure =
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
