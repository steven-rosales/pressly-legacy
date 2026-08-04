import type { JsonObject } from '@pressly/codec';
import type { CommandContext } from '@pressly/kernel';
import type {
  IncomingOrderProposalCustomer,
  IncomingOrderProposalDecisionCommand,
} from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.model.ts';
import type { IncomingOrderProposalResolutionInput } from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal-resolution.model.ts';
import type { OrderCustomer } from '../../../foundations/language/order/order.model.ts';

export type AcceptIncomingOrderProposalReasonCode = 'incoming_order_accepted';

export type AcceptIncomingOrderProposalCommand =
  IncomingOrderProposalDecisionCommand<AcceptIncomingOrderProposalReasonCode>;

export type AcceptIncomingOrderProposalInput =
  IncomingOrderProposalResolutionInput &
    Readonly<{
      customer: OrderCustomer;
      canonical: Readonly<{
        state: 'open';
        releaseState: 'unreleased';
      }>;
    }>;

export type ResolveIncomingOrderProposalCustomerInput = Readonly<{
  source: string;
  businessId: string;
  externalUserId: string;
  profile: Omit<
    IncomingOrderProposalCustomer,
    'externalUserId' | 'normalizedPayload'
  >;
  revision: Readonly<{
    at: Date;
    hash: string;
    adapterVersion: string;
    observedAt: Date;
    normalizedPayload: JsonObject;
  }>;
  idempotencyKey: string;
  context: CommandContext;
  now: Date;
}>;
