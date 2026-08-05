import { result, type Result } from '@pressly/kernel';
import type {
  PricingChangeCommand,
  PricingChangePlan,
} from '../../../foundations/language/pricing-change/pricing-change.model.ts';
import {
  makePricingChangePlan,
  validatePricingChangeCommand,
} from '../../../foundations/language/pricing-change/pricing-change.policy.ts';
import type { CurrentPricingReader } from '../../../foundations/ports/current-pricing-reader/current-pricing-reader.port.ts';
import type { PlanPricingChangeFailure } from './plan-pricing-change.failure.ts';

export type PlanPricingChange = (
  command: PricingChangeCommand,
) => Promise<Result<PricingChangePlan, PlanPricingChangeFailure>>;

export const makePlanPricingChange = (
  loadCurrentPricing: CurrentPricingReader,
): PlanPricingChange =>
  async function planPricingChange(command) {
    const validCommand = validatePricingChangeCommand(command);
    if (result.isErr(validCommand)) return result.err(validCommand.error);

    const current = await loadCurrentPricing({
      serviceSlug: command.serviceSlug,
    });
    if (result.isErr(current)) return result.err(current.error);

    return makePricingChangePlan({
      command: validCommand.value,
      currentSet: current.value.currentSet,
      currentItems: current.value.currentItems,
    });
  };
