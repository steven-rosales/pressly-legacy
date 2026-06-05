import type {
  PricingChangePlan,
  PublishPricingChangeCommand,
} from '@pressly/contracts';
import { err, type AppError, type Result } from '@pressly/errors';
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
      return err(pricingPolicyViolationsToAppError(violations));

    const current = await store.loadCurrentPricingForPublish({
      serviceSlug: command.serviceSlug,
      ...(command.locationSlug === undefined
        ? {}
        : { locationSlug: command.locationSlug }),
    });

    if (!current.ok) return current;

    const plan = makePricingChangePlan({
      command,
      currentSet: current.value.currentSet,
      currentItems: current.value.currentItems,
    });

    if (!plan.ok)
      return err(pricingPolicyViolationsToAppError(plan.violations));

    return { ok: true, value: plan.plan };
  };
