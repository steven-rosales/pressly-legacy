import type { IncomingOrderProposal } from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.entity.ts';
import type { IncomingOrderProposalDecisionCommand } from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.model.ts';

export type RestoreIncomingOrderProposalCommand =
  IncomingOrderProposalDecisionCommand<'source_closure_overridden'>;

export type RestoreIncomingOrderProposalResult = Readonly<{
  proposalId: string;
  state: 'restored_pending';
  version: number;
  replayed: boolean;
}>;

export type RestoreIncomingOrderProposalInput = Readonly<{
  proposal: IncomingOrderProposal;
  idempotencyKey: string;
  commandHash: string;
  context: RestoreIncomingOrderProposalCommand['context'];
  reasonCode: 'source_closure_overridden';
  reasonNote: string | null;
  restoredAt: Date;
  transition: Readonly<{
    from: 'source_closed';
    to: 'restored_pending';
    event: 'restore';
    version: number;
  }>;
}>;
