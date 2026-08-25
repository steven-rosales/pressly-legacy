import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import * as result from '@pressly/cells/result';
import {
  makePricingChangePlan,
  type PricingChangeCommand,
  type PricingChangePlan,
  validatePricingChangeCommand,
} from '../../../model/pricing-change.ts';
import type {
  PlanPricingChangeDependencies,
  PlanPricingChangeExpectedFailure,
} from './types.ts';

export type ExecutePlanPricingChange = (
  command: PricingChangeCommand,
) => Promise<CellOutcome<PricingChangePlan, PlanPricingChangeExpectedFailure>>;

export const makeExecutePlanPricingChange = (
  dependencies: PlanPricingChangeDependencies,
): ExecutePlanPricingChange =>
  async function executePlanPricingChange(command) {
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
      return result.isErr(plan)
        ? { kind: 'failure', failure: plan.error }
        : { kind: 'success', value: plan.value };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'pricing_read_failed',
          message: 'Failed to read pricing.',
          safeMessage: 'Pricing is temporarily unavailable.',
          status: 503,
          cause,
        }),
      );
    }
  };
