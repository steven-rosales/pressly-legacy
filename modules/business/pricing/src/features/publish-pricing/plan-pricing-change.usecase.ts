import { result, type Result } from '@pressly/kernel';
import type {
  PricingChangePlan,
  PublishPricingChangeCommand,
} from '@pressly/contracts';
import { type AppError } from '@pressly/errors';
import {
  makePricingChangePlan,
  validatePricingCommand,
} from '../../domain/publish-pricing-change.policy.ts';
import { pricingPolicyViolationsToAppError } from './publish-pricing-change.error.ts';
import type { PricingChangeStore } from './publish-pricing-change.port.ts';

export type PlanPricingChange = (
  command: PublishPricingChangeCommand,
) => Promise<Result<PricingChangePlan, AppError>>;

export const makePlanPricingChange =
  (store: PricingChangeStore): PlanPricingChange =>
  async (command) => {
    const violations = validatePricingCommand(command);

    if (violations.length > 0)
      return result.err(pricingPolicyViolationsToAppError(violations));

    const current = await store.loadCurrentPricingForPublish({
      serviceSlug: command.serviceSlug,
      ...(command.locationSlug === undefined
        ? {}
        : { locationSlug: command.locationSlug }),
    });

    if (result.isErr(current)) return current;

    const plan = makePricingChangePlan({
      command,
      currentSet: current.value.currentSet,
      currentItems: current.value.currentItems,
    });

    if (!plan.ok)
      return result.err(pricingPolicyViolationsToAppError(plan.violations));

    return result.ok(plan.plan);
  };
