import { result, type Result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import type {
  PricingChangeCommand,
  PublishedPricingChange,
} from '../../../foundations/language/pricing-change/pricing-change.model.ts';
import {
  makePricingChangePlan,
  validatePricingChangeCommand,
} from '../../../foundations/language/pricing-change/pricing-change.policy.ts';
import type { CurrentPricingReader } from '../../../foundations/ports/current-pricing-reader/current-pricing-reader.port.ts';
import type { PublishPricingChangeFailure } from './publish-pricing-change.failure.ts';
import type { PricingChangePublisher } from './publish-pricing-change.port.ts';

export type PublishPricingChange = (
  command: PricingChangeCommand,
) => Promise<Result<PublishedPricingChange, PublishPricingChangeFailure>>;

export const makePublishPricingChange = (deps: {
  loadCurrentPricing: CurrentPricingReader;
  publishPricingChange: PricingChangePublisher;
  clock: Clock;
}): PublishPricingChange =>
  async function publishPricingChange(command) {
    const validCommand = validatePricingChangeCommand(command);
    if (result.isErr(validCommand)) return result.err(validCommand.error);

    const current = await deps.loadCurrentPricing({
      serviceSlug: command.serviceSlug,
    });
    if (result.isErr(current)) return result.err(current.error);

    const plan = makePricingChangePlan({
      command: validCommand.value,
      currentSet: current.value.currentSet,
      currentItems: current.value.currentItems,
    });
    if (result.isErr(plan)) return result.err(plan.error);

    return deps.publishPricingChange({
      command: validCommand.value,
      plan: plan.value,
      publishedAt: deps.clock.now(),
    });
  };
