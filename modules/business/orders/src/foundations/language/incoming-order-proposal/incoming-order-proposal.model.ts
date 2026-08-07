import type { JsonObject } from '@pressly/codec';
import type { CommandContext } from '@pressly/kernel';
import type {
  DirectFulfillmentInput,
  OrderItemInput,
} from '../order/order.model.ts';

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
