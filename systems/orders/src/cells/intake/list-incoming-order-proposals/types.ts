import type { IncomingOrderProposalEvent } from '../../../model/incoming-order-proposal/model.ts';

export const listIncomingOrderProposalsOperationId =
  'orders.list-incoming-order-proposals.v1' as const;

export type ListIncomingOrderProposalsQuery = Readonly<{
  locationId: string;
  limit: number;
  cursor: string | null;
  view: 'needs_review' | 'source_closed';
}>;

export type IncomingOrderProposalSummary = Readonly<{
  id: string;
  version: number;
  state: 'pending' | 'source_closed' | 'restored_pending';
  source: string;
  externalOrderId: string;
  locationId: string;
  displayNumber: string | null;
  customer: Readonly<{
    displayName: string | null;
    phone: string | null;
    email: string | null;
  }> | null;
  dueAt: Date;
  estimatedWeightLbs: number | null;
  sourceReportedAt: Date;
  reportedAt: Date;
  sourceClosure: Readonly<{
    kind: 'completed' | 'canceled';
    observedAt: Date;
  }> | null;
  availableActions: readonly IncomingOrderProposalEvent[];
  acceptBlockedReason: 'exact_order_exists' | null;
}>;

export type IncomingOrderProposalListResult = Readonly<{
  items: readonly IncomingOrderProposalSummary[];
  nextCursor: string | null;
}>;

export type ListIncomingOrderProposalsExpectedFailure = Readonly<{
  kind: 'validation';
  code:
    | 'incoming_order_proposal_query_invalid'
    | 'incoming_order_proposal_cursor_invalid';
  message: string;
}>;

export type IncomingOrderProposalCursor = Readonly<{
  view: ListIncomingOrderProposalsQuery['view'];
  observedAt: Date;
  id: string;
}>;

export type ListIncomingOrderProposalsRepository = Readonly<{
  list: (input: {
    query: ListIncomingOrderProposalsQuery;
    cursor: IncomingOrderProposalCursor | null;
  }) => Promise<IncomingOrderProposalListResult>;
}>;
