import type {
  ApplyFulfillmentDemandConflictFailure,
  ApplyFulfillmentDemandExpectedFailure,
  ApplyFulfillmentDemandValidationFailure,
} from './types.ts';

export const applyFulfillmentDemandValidationFailure = (input: {
  code: string;
  message: string;
  safeMessage?: string;
}): ApplyFulfillmentDemandValidationFailure => ({
  kind: 'validation',
  classification: 'semantic',
  code: input.code,
  message: input.message,
  safeMessage: input.safeMessage ?? input.message,
});

export const applyFulfillmentDemandConflictFailure = (input: {
  code: string;
  message: string;
  safeMessage?: string;
}): ApplyFulfillmentDemandConflictFailure => ({
  kind: 'conflict',
  code: input.code,
  message: input.message,
  safeMessage: input.safeMessage ?? input.message,
});

export const applyFulfillmentDemandIdempotencyConflict =
  (): ApplyFulfillmentDemandConflictFailure =>
    applyFulfillmentDemandConflictFailure({
      code: 'production_idempotency_conflict',
      message: 'The idempotency key belongs to a different production command.',
    });

export const applyFulfillmentDemandVersionConflict =
  (): ApplyFulfillmentDemandConflictFailure =>
    applyFulfillmentDemandConflictFailure({
      code: 'production_fulfillment_demand_order_version_conflict',
      message: 'Production order changed during demand application.',
      safeMessage: 'Production state changed. Refresh and try again.',
    });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Repository adapters may throw their typed Production failure to force a
 * transaction rollback. Preserve that narrow behavior without classifying an
 * arbitrary similarly shaped throwable as an expected result.
 */
export const expectedApplyFulfillmentDemandFailureFromThrowable = (
  value: unknown,
): ApplyFulfillmentDemandExpectedFailure | null => {
  if (
    !isRecord(value) ||
    value['tag'] !== 'ProductionFailure' ||
    (value['kind'] !== 'validation' &&
      value['kind'] !== 'not_found' &&
      value['kind'] !== 'conflict') ||
    typeof value['code'] !== 'string' ||
    typeof value['message'] !== 'string' ||
    typeof value['safeMessage'] !== 'string'
  )
    return null;

  return value['kind'] === 'validation'
    ? {
        kind: 'validation',
        classification:
          value['classification'] === 'malformed' ? 'malformed' : 'semantic',
        code: value['code'],
        message: value['message'],
        safeMessage: value['safeMessage'],
      }
    : value['kind'] === 'not_found'
      ? {
          kind: 'not_found',
          code: value['code'],
          message: value['message'],
          safeMessage: value['safeMessage'],
        }
      : {
          kind: 'conflict',
          code: value['code'],
          message: value['message'],
          safeMessage: value['safeMessage'],
        };
};
