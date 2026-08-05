import type {
  CanonicalOrderListResult,
  ListCanonicalOrdersQuery,
} from './list-canonical-orders.model.ts';

export type ListCanonicalOrdersRepository = (
  query: ListCanonicalOrdersQuery,
) => Promise<
  | Readonly<{ kind: 'ok'; value: CanonicalOrderListResult }>
  | Readonly<{ kind: 'invalid_cursor' }>
>;
