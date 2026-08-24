import { bindCell, declareQueryCell } from '@pressly/cells';
import type {
  PricingChangeCommand,
  PricingChangePlan,
} from '../../../model/pricing-change.ts';
import { planPricingChangeContract } from './contract.ts';
import { makeExecutePlanPricingChange } from './execute.ts';
import { planPricingChangeHttpSurfaces } from './http.ts';
import {
  planPricingChangeOperationId,
  type PlanPricingChangeDependencies,
  type PlanPricingChangeExpectedFailure,
} from './types.ts';

export const planPricingChangeCellDeclaration = declareQueryCell<
  PricingChangeCommand,
  PricingChangePlan,
  PlanPricingChangeExpectedFailure
>({
  id: planPricingChangeOperationId,
  contract: planPricingChangeContract,
  authorization: {
    capability: 'pricing:plan',
    timing: 'after-input',
    scope: (input) => `pricing:${input.serviceSlug}:global`,
  },
  surfaces: planPricingChangeHttpSurfaces,
  observability: { operation: 'pricing.plan_pricing_change' },
});

export const makePlanPricingChangeCell = (
  dependencies: PlanPricingChangeDependencies,
) =>
  bindCell(
    planPricingChangeCellDeclaration,
    makeExecutePlanPricingChange(dependencies),
  );
