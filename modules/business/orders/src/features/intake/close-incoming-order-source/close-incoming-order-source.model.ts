import type { JsonObject } from '@pressly/codec';
import type { CommandContext } from '@pressly/kernel';
import type { IncomingOrderProposal } from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.entity.ts';

export type CloseIncomingOrderSourceCommand = Readonly<{
  context: CommandContext;
  source: string;
  externalOrderId: string;
  terminalCode: 'completed' | 'canceled';
  revision: Readonly<{
    at: Date;
    hash: string;
    adapterVersion: string;
    observedAt: Date;
    normalizedPayload: JsonObject;
  }>;
}>;

export type CloseIncomingOrderSourceResult = Readonly<{
  outcome:
    | 'source_closed'
    | 'tombstoned'
    | 'existing_order'
    | 'already_decided'
    | 'already_source_closed';
  proposalId: string | null;
  version: number | null;
  canonical: Readonly<{
    orderId: string;
    fulfillmentId: string;
    locationId: string;
    releaseState: 'unreleased' | 'released' | 'withdrawn';
  }> | null;
  replayed: boolean;
}>;

export type CloseIncomingOrderProposalInput = Readonly<{
  proposal: IncomingOrderProposal;
  command: CloseIncomingOrderSourceCommand;
  idempotencyKey: string;
  commandHash: string;
  closedAt: Date;
  transition: Readonly<{
    from: 'pending';
    to: 'source_closed';
    event: 'source_close';
    version: number;
  }>;
}>;
