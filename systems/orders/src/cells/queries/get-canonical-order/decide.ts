import type {
  GetCanonicalOrderExpectedFailure,
  GetCanonicalOrderQuery,
} from './types.ts';

export const validateGetCanonicalOrder = (
  query: GetCanonicalOrderQuery,
): GetCanonicalOrderExpectedFailure | null =>
  query.businessId.trim() === '' ||
  query.orderId.trim() === '' ||
  query.locationIds.some((id) => id.trim() === '')
    ? {
        kind: 'validation',
        code: 'order_get_invalid',
        message: 'The Order query is invalid.',
      }
    : null;

export const canonicalOrderNotFound = (): GetCanonicalOrderExpectedFailure => ({
  kind: 'not_found',
  code: 'order_not_found',
  message: 'The Order was not found.',
});
