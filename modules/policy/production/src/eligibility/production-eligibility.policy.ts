import { result, type Result } from '@pressly/kernel';

export type ProductionPolicyRejection = Readonly<{
  code: string;
  message: string;
}>;

export type EligibilityInput = Readonly<{
  state: 'ready_for_production' | 'not_ready';
  derivedWeightLbs: number;
  bagCount: number | null;
}>;

export const evaluateProductionEligibility = (
  input: EligibilityInput,
): Result<Readonly<{ eligible: true }>, ProductionPolicyRejection> => {
  if (input.state !== 'ready_for_production')
    return result.err({
      code: 'ORDER_NOT_READY_FOR_PRODUCTION',
      message: 'Only ready order demand is eligible for production.',
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

  return result.ok({ eligible: true });
};
