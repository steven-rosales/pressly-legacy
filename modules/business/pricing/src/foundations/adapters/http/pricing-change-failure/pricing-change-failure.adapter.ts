import { type AppError } from '@pressly/errors/app-error';
import {
  conflictError,
  notFoundError,
  validationError,
} from '@pressly/errors/factories';
import type {
  PricingChangeFailure,
  PricingChangePolicyFailure,
  PricingPolicyViolation,
} from '../../../language/pricing-change/pricing-change.failure.ts';

const policyViolationDetails = (
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

const policyFailureToAppError = (
  failure: PricingChangePolicyFailure,
): AppError => {
  const firstViolation = failure.violations[0];
  const details = {
    violations: failure.violations.map((violation) => ({
      code: violation.code,
      ...policyViolationDetails(violation),
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

export const pricingChangeFailureToAppError = (
  failure: PricingChangeFailure,
): AppError => {
  if ('violations' in failure) return policyFailureToAppError(failure);

  switch (failure.code) {
    case 'pricing_service_not_found':
      return notFoundError({
        code: failure.code,
        message: `Pricing service not found: ${failure.serviceSlug}`,
        safeMessage: 'Pricing service was not found.',
      });
    case 'active_pricing_set_not_found':
      return notFoundError({
        code: failure.code,
        message: `Active pricing set not found: ${failure.serviceSlug}`,
        safeMessage: 'Active pricing set was not found.',
      });
    case 'multiple_active_pricing_sets':
      return conflictError({
        code: failure.code,
        message: `Multiple active pricing sets exist for ${failure.serviceSlug}.`,
        safeMessage: 'Pricing state is ambiguous.',
      });
    case 'active_pricing_set_has_no_items':
      return conflictError({
        code: failure.code,
        message: `Pricing set has no items: ${failure.pricingSetId}.`,
        safeMessage: 'Active pricing set has no items.',
      });
    case 'pricing_state_changed':
      return conflictError({
        code: failure.code,
        message: 'Pricing state changed before the publish could be committed.',
        safeMessage: 'Pricing changed while this publish was being prepared.',
        details: {
          expectedPricingSetId: failure.expectedPricingSetId,
          actualPricingSetId: failure.actualPricingSetId,
        },
      });
  }
};
