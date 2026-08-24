import type {
  ListCanonicalOrdersExpectedFailure,
  ListCanonicalOrdersQuery,
} from './types.ts';

export const validateListCanonicalOrders = (
  query: ListCanonicalOrdersQuery,
): ListCanonicalOrdersExpectedFailure | null =>
  query.businessId.trim() === '' ||
  query.locationIds.some((id) => id.trim() === '') ||
  query.limit < 1 ||
  query.limit > 100 ||
  (query.query !== null && query.query.trim().length > 120)
    ? {
        kind: 'validation',
        code: 'order_list_invalid',
        message: 'The Order query is invalid.',
      }
    : null;

export const normalizeListCanonicalOrders = (
  query: ListCanonicalOrdersQuery,
): ListCanonicalOrdersQuery => ({
  ...query,
  query:
    query.query === null || query.query.trim() === ''
      ? null
      : query.query.trim(),
});

export const invalidOrderCursor = (): ListCanonicalOrdersExpectedFailure => ({
  kind: 'validation',
  code: 'order_cursor_invalid',
  message: 'The Order page cursor is invalid.',
});
