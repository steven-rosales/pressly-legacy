import type { IncomingOrderProposalDecisionCommand } from '../../../model/incoming-order-proposal/model.ts';

export type RestoreIncomingOrderProposalCommand =
  IncomingOrderProposalDecisionCommand<'source_closure_overridden'>;
export type RestoreIncomingOrderProposalResult = Readonly<{
  proposalId: string;
  state: 'restored_pending';
  version: number;
  replayed: boolean;
}>;
export type RestoreIncomingOrderProposalExpectedFailure =
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
