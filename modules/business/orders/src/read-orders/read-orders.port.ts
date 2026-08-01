import type {
  CanonicalOrderDetail,
  CanonicalOrderListResult,
  ListCanonicalOrdersQuery,
} from '../orders.port.ts';

export type ReadOrdersRepository = Readonly<{
  list: (
    query: ListCanonicalOrdersQuery,
  ) => Promise<
    | Readonly<{ kind: 'ok'; value: CanonicalOrderListResult }>
    | Readonly<{ kind: 'invalid_cursor' }>
  >;
  get: (query: {
    businessId: string;
    locationIds: readonly string[];
    orderId: string;
  }) => Promise<CanonicalOrderDetail | null>;
}>;
