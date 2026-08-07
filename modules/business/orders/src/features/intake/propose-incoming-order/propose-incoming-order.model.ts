import type { JsonObject } from '@pressly/codec';
import type { CommandContext } from '@pressly/kernel';
import type { IncomingOrderProposalSnapshot } from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.model.ts';

export type ProposeIncomingOrderCommand = Readonly<{
  context: CommandContext;
  source: string;
  externalOrderId: string;
  proposalKind: 'submitted_order';
  snapshot: IncomingOrderProposalSnapshot;
  revision: Readonly<{
    at: Date;
    hash: string;
    adapterVersion: string;
    observedAt: Date;
    normalizedPayload: JsonObject;
  }>;
}>;

export type IncomingOrderProposalMutationResult = Readonly<{
  proposalId: string | null;
  version: number | null;
  replayed: boolean;
  outcome:
    | 'proposed'
    | 'existing_proposal'
    | 'existing_order'
    | 'source_closed';
}>;
