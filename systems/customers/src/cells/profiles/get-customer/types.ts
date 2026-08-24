import type { CustomerSummary } from '../../../model/customer.ts';

export const getCustomerOperationId = 'customers.get-customer.v1' as const;

export type GetCustomerQuery = Readonly<{
  businessId: string;
  userId: string;
}>;

export type GetCustomerExpectedFailure =
  | Readonly<{ kind: 'validation'; code: 'user_get_invalid' }>
  | Readonly<{ kind: 'not_found'; code: 'user_not_found' }>;

export type GetCustomerRepository = (
  query: GetCustomerQuery,
) => Promise<CustomerSummary | null>;
