import * as result from '@pressly/cells/result';
import type { CodedFailure, Result } from '@pressly/cells/result';

type EligibilityDemandPhase =
  | 'expected'
  | 'inbound'
  | 'production_released'
  | 'post_production'
  | 'withdrawn';

export type EligibilityInput = Readonly<{
  phase: EligibilityDemandPhase;
  derivedWeightLbs: number;
  bagCount: number | null;
}>;

export const evaluateIntakeAdmission = (
  input: EligibilityInput,
): Result<
  Readonly<{ status: 'release_pending' | 'eligible' }>,
  CodedFailure
> => {
  if (input.phase === 'withdrawn')
    return result.err({
      code: 'ORDER_DEMAND_WITHDRAWN',
      message: 'A withdrawn order cannot be admitted to production.',
    });

  if (input.phase === 'post_production')
    return result.err({
      code: 'ORDER_SOURCE_ALREADY_POST_PRODUCTION',
      message:
        'The source says this order has passed production. Review the mismatch before recording intake.',
    });

  if (!Number.isFinite(input.derivedWeightLbs) || input.derivedWeightLbs <= 0)
    return result.err({
      code: 'ORDER_WEIGHT_INVALID',
      message: 'Production weight must be positive.',
    });

  if (input.bagCount === null)
    return result.err({
      code: 'ORDER_BAG_COUNT_MISSING',
      message: 'Bag intake must be recorded before scheduling.',
    });

  if (!Number.isInteger(input.bagCount) || input.bagCount < 0)
    return result.err({
      code: 'ORDER_BAG_COUNT_INVALID',
      message: 'Bag count must be a nonnegative integer.',
    });

  return result.ok({
    status:
      input.phase === 'production_released' ? 'eligible' : 'release_pending',
  });
};
