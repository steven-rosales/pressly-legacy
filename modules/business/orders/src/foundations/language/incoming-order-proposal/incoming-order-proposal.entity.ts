import type { JsonObject } from '@pressly/codec';
import type {
  IncomingOrderProposalEvent,
  IncomingOrderProposalSnapshot,
  IncomingOrderProposalState,
} from './incoming-order-proposal.model.ts';

export type IncomingOrderProposalResolution = Readonly<{
  decision: 'accepted' | 'rejected';
  proposalVersion: number;
  orderId: string | null;
  fulfillmentId: string | null;
  idempotencyKey: string;
  commandHash: string;
}>;

export type IncomingOrderProposal = Readonly<{
  id: string;
  source: string;
  externalOrderId: string;
  locationId: string;
  proposalKind: 'pickup' | 'submitted_order';
  sourceRevisionAt: Date;
  sourceRevisionHash: string;
  adapterVersion: string;
  sourceNormalizedPayload: JsonObject;
  snapshot: IncomingOrderProposalSnapshot;
  observedAt: Date;
  state: IncomingOrderProposalState;
  version: number;
  resolution: IncomingOrderProposalResolution | null;
  sourceClosure: Readonly<{
    kind: 'completed' | 'canceled';
    observedAt: Date;
  }> | null;
}>;

export type IncomingOrderSourceTombstone = Readonly<{
  source: string;
  externalOrderId: string;
  proposalId: string | null;
  terminalCode: 'completed' | 'canceled';
  sourceRevisionAt: Date;
  sourceRevisionHash: string;
  observedAt: Date;
}>;

export type ExactCanonicalOrder = Readonly<{
  orderId: string;
  fulfillment: Readonly<{
    fulfillmentId: string;
    locationId: string;
    releaseState: 'unreleased' | 'released' | 'withdrawn';
  }> | null;
}>;

export type IncomingOrderProposalTransition = Readonly<{
  proposalId: string;
  from: IncomingOrderProposalState;
  to: IncomingOrderProposalState;
  event: IncomingOrderProposalEvent;
  proposalVersion: number;
  commandHash: string;
}>;
