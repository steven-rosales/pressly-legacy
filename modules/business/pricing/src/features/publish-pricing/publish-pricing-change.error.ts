import { conflictError, validationError, type AppError } from '@pressly/errors';
import type { PricingPolicyViolation } from '../../domain/publish-pricing-change.policy.ts';

const pricingPolicyViolationDetails = (
  violation: PricingPolicyViolation,
): Record<string, unknown> => {
  switch (violation.code) {
    case 'pricing_change_reason_too_short':
      return {
        minimumLength: violation.minimumLength,
        actualLength: violation.actualLength,
      };

    case 'duplicate_pricing_item_code':
    case 'pricing_item_code_not_found':
      return { code: violation.itemCode };

    case 'invalid_pricing_item_price':
      return {
        code: violation.itemCode,
        priceCents: violation.priceCents,
      };

    case 'pricing_change_has_no_changes':
      return {};
  }
};

export const pricingPolicyViolationsToAppError = (
  violations: readonly PricingPolicyViolation[],
): AppError => {
  const [firstViolation] = violations;

  if (firstViolation === undefined)
    return conflictError({
      code: 'pricing_policy_violation',
      message: 'Pricing policy failed without a specific violation.',
      safeMessage: 'Pricing change could not be completed.',
    });

  const details = {
    violations: violations.map((violation) => ({
      code: violation.code,
      ...pricingPolicyViolationDetails(violation),
    })),
  };

  switch (firstViolation.code) {
    case 'pricing_change_reason_too_short':
      return validationError({
        code: firstViolation.code,
        message: `Pricing change reason must be at least ${firstViolation.minimumLength} characters.`,
        safeMessage: 'A clearer reason is required.',
        details,
      });

    case 'duplicate_pricing_item_code':
      return validationError({
        code: firstViolation.code,
        message: `Duplicate pricing item code: ${firstViolation.itemCode}.`,
        safeMessage: 'Pricing change contains duplicate item codes.',
        details,
      });

    case 'invalid_pricing_item_price':
      return validationError({
        code: firstViolation.code,
        message: `Price must be greater than zero for ${firstViolation.itemCode}.`,
        safeMessage: 'Pricing item prices must be greater than zero.',
        details,
      });

    case 'pricing_item_code_not_found':
      return conflictError({
        code: firstViolation.code,
        message: `Pricing item code does not exist: ${firstViolation.itemCode}.`,
        safeMessage: 'Pricing change references an unknown item code.',
        details,
      });

    case 'pricing_change_has_no_changes':
      return conflictError({
        code: firstViolation.code,
        message: 'Pricing change does not modify any item.',
        safeMessage: 'Pricing change has no differences to publish.',
        details,
      });
  }
};
