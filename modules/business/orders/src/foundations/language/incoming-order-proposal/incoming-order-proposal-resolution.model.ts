import type { CommandContext } from '@pressly/kernel';
import type { IncomingOrderProposal } from './incoming-order-proposal.entity.ts';

export type IncomingOrderProposalResolutionInput = Readonly<{
  proposal: IncomingOrderProposal;
  idempotencyKey: string;
  commandHash: string;
  context: CommandContext;
  reasonCode: string;
  reasonNote: string | null;
  decidedAt: Date;
  transition: Readonly<{
    from: 'pending' | 'restored_pending';
    to: 'accepted' | 'rejected';
    event: 'accept' | 'reject';
    version: number;
  }>;
}>;
