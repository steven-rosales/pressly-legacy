import type {
  ListCustomersExpectedFailure,
  ListCustomersQuery,
} from './types.ts';

export const validateListCustomers = (
  query: ListCustomersQuery,
): ListCustomersExpectedFailure | null =>
  query.businessId.trim() === '' ||
  query.limit < 1 ||
  query.limit > 100 ||
  (query.query !== null && query.query.trim().length > 120)
    ? { kind: 'validation', code: 'user_list_invalid' }
    : null;

export const normalizeListCustomersQuery = (
  query: ListCustomersQuery,
): ListCustomersQuery => ({
  ...query,
  query:
    query.query === null || query.query.trim() === ''
      ? null
      : query.query.trim(),
});
