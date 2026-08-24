import type { GetCustomerExpectedFailure, GetCustomerQuery } from './types.ts';

export const validateGetCustomer = (
  query: GetCustomerQuery,
): GetCustomerExpectedFailure | null =>
  query.businessId.trim() === '' || query.userId.trim() === ''
    ? { kind: 'validation', code: 'user_get_invalid' }
    : null;
