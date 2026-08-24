import type { JsonObject } from '@pressly/codec';
import type { CommandContext } from '@pressly/cells/command-context';
import type { DirectFulfillmentInput, OrderItemInput } from '../order-input.ts';

export type IncomingOrderProposalState =
  | 'pending'
  | 'source_closed'
  | 'restored_pending'
  | 'accepted'
  | 'rejected';

export type IncomingOrderProposalEvent =
  | 'accept'
  | 'reject'
  | 'source_close'
  | 'restore';

export type IncomingOrderProposalDecisionCommand<ReasonCode extends string> =
  Readonly<{
    proposalId: string;
    locationId: string;
    expectedVersion: number;
    idempotencyKey: string;
    context: CommandContext;
    reasonCode: ReasonCode;
    reasonNote: string | null;
  }>;

export type IncomingOrderProposalDecisionResult = Readonly<{
  proposalId: string;
  state: 'accepted' | 'rejected';
  version: number;
  orderId: string | null;
  fulfillmentId: string | null;
  replayed: boolean;
}>;

export type IncomingOrderProposalCustomer = Readonly<{
  externalUserId: string;
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  phone: string | null;
  email: string | null;
  normalizedPayload: JsonObject;
}>;

export type IncomingOrderProposalSnapshot = Readonly<{
  customer: IncomingOrderProposalCustomer | null;
  displayNumber: string | null;
  dueAt: Date;
  currency: string;
  totalAmountCents: number;
  balanceDueCents: number | null;
  items: readonly OrderItemInput[];
  fulfillment: DirectFulfillmentInput;
}>;

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
  adapterVersion: string;
  normalizedPayload: JsonObject;
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
  expectedVersion: number;
  transition: Readonly<{
    from: 'pending' | 'source_closed' | 'restored_pending';
    to: 'source_closed' | 'restored_pending' | 'accepted' | 'rejected';
    event: IncomingOrderProposalEvent;
    version: number;
  }>;
  idempotencyKey: string;
  commandHash: string;
  context: CommandContext;
  reasonCode: string;
  reasonNote: string | null;
  sourceTerminalCode: 'completed' | 'canceled' | null;
  occurredAt: Date;
}>;
