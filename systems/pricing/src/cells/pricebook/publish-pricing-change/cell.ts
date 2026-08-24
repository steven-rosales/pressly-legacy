import { bindCell, declareCommandCell } from '@pressly/cells';
import type {
  PricingChangeCommand,
  PublishedPricingChange,
} from '../../../model/pricing-change.ts';
import { publishPricingChangeContract } from './contract.ts';
import { makeExecutePublishPricingChange } from './execute.ts';
import { publishPricingChangeHttpSurfaces } from './http.ts';
import {
  publishPricingChangeOperationId,
  type PublishPricingChangeDependencies,
  type PublishPricingChangeExpectedFailure,
} from './types.ts';

export const publishPricingChangeCellDeclaration = declareCommandCell<
  PricingChangeCommand,
  PublishedPricingChange,
  PublishPricingChangeExpectedFailure
>({
  id: publishPricingChangeOperationId,
  contract: publishPricingChangeContract,
  authorization: {
    capability: 'pricing:publish',
    timing: 'after-input',
    scope: (input) => `pricing:${input.serviceSlug}:global`,
  },
  consistency: {
    transaction: 'required',
    concurrency: 'partitioned',
    concurrencyKey: (input) => input.serviceSlug,
  },
  idempotency: { required: false },
  surfaces: publishPricingChangeHttpSurfaces,
  emits: [],
  consumes: [],
  observability: { operation: 'pricing.publish_pricing_change' },
});

export const makePublishPricingChangeCell = (
  dependencies: PublishPricingChangeDependencies,
) =>
  bindCell(
    publishPricingChangeCellDeclaration,
    makeExecutePublishPricingChange(dependencies),
  );
