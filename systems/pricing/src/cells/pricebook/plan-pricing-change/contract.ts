import { defineBoundaryContract, defineCellContract } from '@pressly/cells';
import {
  decodePricingChangeCommand,
  decodePlanPricingChangeFailure,
  decodePricingChangePlan,
  encodePricingChangeCommand,
  encodePricingChangeFailure,
  encodePricingChangePlan,
} from '../../../model/pricing-change-contract.ts';
import type {
  PricingChangeCommand,
  PricingChangePlan,
} from '../../../model/pricing-change.ts';
import type { PlanPricingChangeExpectedFailure } from './types.ts';

export const planPricingChangeContract = defineCellContract<
  PricingChangeCommand,
  PricingChangePlan,
  PlanPricingChangeExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodePricingChangeCommand,
    encode: encodePricingChangeCommand,
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: decodePricingChangePlan,
    encode: encodePricingChangePlan,
  }),
  failure: defineBoundaryContract({
    version: 1,
    decode: decodePlanPricingChangeFailure,
    encode: encodePricingChangeFailure,
  }),
});
