import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import * as result from '@pressly/cells/result';
import {
  makePricingChangePlan,
  type PricingChangeCommand,
  type PublishedPricingChange,
  validatePricingChangeCommand,
} from '../../../model/pricing-change.ts';
import type {
  PublishPricingChangeDependencies,
  PublishPricingChangeExpectedFailure,
} from './types.ts';

export type ExecutePublishPricingChange = (
  command: PricingChangeCommand,
) => Promise<
  CellOutcome<PublishedPricingChange, PublishPricingChangeExpectedFailure>
>;

export const makeExecutePublishPricingChange = (
  dependencies: PublishPricingChangeDependencies,
): ExecutePublishPricingChange =>
  async function executePublishPricingChange(command) {
    const valid = validatePricingChangeCommand(command);
    if (result.isErr(valid)) return { kind: 'failure', failure: valid.error };

    try {
      const current = await dependencies.loadCurrentPricing(
        command.serviceSlug,
      );
      if (result.isErr(current))
        return { kind: 'failure', failure: current.error };
      const plan = makePricingChangePlan({
        command: valid.value,
        currentSet: current.value.currentSet,
        currentItems: current.value.currentItems,
      });
      if (result.isErr(plan)) return { kind: 'failure', failure: plan.error };

      const published = await dependencies.publishPricingChange({
        command: valid.value,
        plan: plan.value,
        publishedAt: dependencies.clock.now(),
      });
      return result.isErr(published)
        ? { kind: 'failure', failure: published.error }
        : { kind: 'success', value: published.value };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'pricing_publish_failed',
          message: 'Failed to publish pricing change.',
          safeMessage: 'Pricing change could not be published.',
          status: 503,
          cause,
        }),
      );
    }
  };
