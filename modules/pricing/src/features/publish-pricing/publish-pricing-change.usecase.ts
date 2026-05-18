import { assertCan, makeActor } from '@pressly/auth';
import type {
  PublishPricingChangeCommand,
  PublishPricingChangeResult,
} from '@pressly/contracts';
import {
  err,
  normalizeUnknownError,
  type AppError,
  type Result,
} from '@pressly/errors';
import {
  makePricingChangePlan,
  validatePricingCommand,
} from '../../domain/publish-pricing-change.policy.ts';
import { pricingPolicyViolationsToAppError } from './publish-pricing-change.error.ts';
import type { PricingChangeStore } from './publish-pricing-change.port.ts';

export type PublishPricingChange = (
  command: PublishPricingChangeCommand,
) => Promise<Result<PublishPricingChangeResult, AppError>>;

export const makePublishPricingChange =
  (
    store: PricingChangeStore,
    options: Readonly<{ now?: () => Date }> = {},
  ): PublishPricingChange =>
  async (command) => {
    try {
      assertCan(makeActor(command.actor), 'pricing:publish');
    } catch (error) {
      return err(normalizeUnknownError(error));
    }

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

    if (!plan.ok) return err(pricingPolicyViolationsToAppError(plan.violations));

    const now = options.now ?? (() => new Date());

    return store.commitPricingChangePlan({
      command,
      plan: plan.plan,
      publishedAt: now(),
    });
  };
