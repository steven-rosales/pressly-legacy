import type { CustomerSummary } from '../../../model/customer.ts';

export const listCustomersOperationId = 'customers.list-customers.v1' as const;

export type ListCustomersQuery = Readonly<{
  businessId: string;
  query: string | null;
  active: boolean | null;
  limit: number;
  cursor: string | null;
}>;

export type ListCustomersResult = Readonly<{
  items: readonly CustomerSummary[];
  nextCursor: string | null;
}>;

export type ListCustomersExpectedFailure = Readonly<{
  kind: 'validation';
  code: 'user_list_invalid' | 'user_cursor_invalid';
}>;

export type ListCustomersRepository = (
  query: ListCustomersQuery,
) => Promise<
  | Readonly<{ kind: 'ok'; value: ListCustomersResult }>
  | Readonly<{ kind: 'invalid_cursor' }>
>;
