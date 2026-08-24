import type {
  CommitOrderRouteIdempotencyConflictFailure,
  CommitOrderRouteNotFoundFailure,
} from './types.ts';

export const commitOrderRouteNotFound =
  (): CommitOrderRouteNotFoundFailure => ({
    kind: 'not_found',
    code: 'production_order_route_not_found',
    message: 'The production run, order, or current batch was not found.',
    safeMessage: 'The production run, order, or current batch was not found.',
  });

export const commitOrderRouteIdempotencyConflict =
  (): CommitOrderRouteIdempotencyConflictFailure => ({
    kind: 'conflict',
    code: 'production_idempotency_conflict',
    message: 'The idempotency key belongs to a different production command.',
    safeMessage:
      'The idempotency key belongs to a different production command.',
  });

export const commitOrderRouteConcurrencyConflict = (input: {
  code: string;
  message: string;
}): Readonly<{
  kind: 'conflict';
  code: string;
  message: string;
  safeMessage: 'Production state changed. Refresh and try again.';
}> => ({
  kind: 'conflict',
  code: input.code,
  message: input.message,
  safeMessage: 'Production state changed. Refresh and try again.',
});
