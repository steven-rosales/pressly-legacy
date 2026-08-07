import type { Result } from '@pressly/kernel';
import type {
  IncomingOrderProposalListResult,
  ListIncomingOrderProposalsQuery,
} from './list-incoming-order-proposals.model.ts';
import type { ListIncomingOrderProposalsFailure } from './list-incoming-order-proposals.failure.ts';

export type ListIncomingOrderProposals = (
  query: ListIncomingOrderProposalsQuery,
) => Promise<
  Result<IncomingOrderProposalListResult, ListIncomingOrderProposalsFailure>
>;

export type ListIncomingOrderProposalsRepository = Readonly<{
  list: (query: ListIncomingOrderProposalsQuery) => Promise<
    | Readonly<{
        kind: 'ok';
        value: IncomingOrderProposalListResult;
      }>
    | Readonly<{ kind: 'invalid_cursor' }>
  >;
}>;
