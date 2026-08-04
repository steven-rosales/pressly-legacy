import type { IncomingOrderProposalDecisionCommand } from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.model.ts';

export type RejectIncomingOrderProposalReasonCode =
  | 'already_handled'
  | 'duplicate_order'
  | 'not_pressly_work'
  | 'manager_rejected';

export type RejectIncomingOrderProposalCommand =
  IncomingOrderProposalDecisionCommand<RejectIncomingOrderProposalReasonCode>;
