import type {
  PlaceOrderExactlyConflictFailure,
  PlaceOrderExactlyNotFoundFailure,
} from './types.ts';

export const placeOrderExactlyNotFound =
  (): PlaceOrderExactlyNotFoundFailure => ({
    kind: 'not_found',
    code: 'production_placement_context_not_found',
    message: 'The production run or order was not found.',
    safeMessage: 'The production run or order was not found.',
  });

export const placeOrderExactlyIdempotencyConflict =
  (): PlaceOrderExactlyConflictFailure => ({
    kind: 'conflict',
    code: 'production_idempotency_conflict',
    message: 'The idempotency key belongs to a different production command.',
    safeMessage:
      'The idempotency key belongs to a different production command.',
  });

export const placeOrderExactlyConflict = (
  code: string,
  message: string,
  safeMessage = message,
): PlaceOrderExactlyConflictFailure => ({
  kind: 'conflict',
  code,
  message,
  safeMessage,
});

export const placeOrderExactlyConcurrencyConflict = (
  code: string,
  message: string,
): PlaceOrderExactlyConflictFailure =>
  placeOrderExactlyConflict(
    code,
    message,
    'Production state changed. Refresh and try again.',
  );
