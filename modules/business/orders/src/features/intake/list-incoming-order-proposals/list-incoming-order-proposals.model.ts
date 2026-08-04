import type { IncomingOrderProposalEvent } from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.model.ts';

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

export type ListIncomingOrderProposalsQuery = Readonly<{
  locationId: string;
  limit: number;
  cursor: string | null;
  view: 'needs_review' | 'source_closed';
}>;

export type IncomingOrderProposalListResult = Readonly<{
  items: readonly IncomingOrderProposalSummary[];
  nextCursor: string | null;
}>;

export type IncomingOrderProposalCursor = Readonly<{
  view: 'needs_review' | 'source_closed';
  observedAt: Date;
  id: string;
}>;
