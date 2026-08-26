import { defineOperation } from '@pressly/cells';
import { applyFulfillmentDemandContract } from './contract.ts';
import {
  makeExecuteApplyFulfillmentDemand,
  type ApplyFulfillmentDemandDependencies,
} from './execute.ts';
import type {
  ApplyFulfillmentDemandCommand,
  ApplyFulfillmentDemandExpectedFailure,
  ApplyFulfillmentDemandResult,
} from './types.ts';
import { applyFulfillmentDemandOperationId } from './types.ts';
import { applyFulfillmentDemandJobSurface } from './job.ts';
import { applyFulfillmentDemandConsumedMessages } from './message.ts';

export const applyFulfillmentDemandCellDeclaration = defineOperation<
  ApplyFulfillmentDemandCommand,
  ApplyFulfillmentDemandResult,
  ApplyFulfillmentDemandExpectedFailure
>({
  kind: 'reaction',
  id: applyFulfillmentDemandOperationId,
  authentication: 'none',
  contract: applyFulfillmentDemandContract,
  consistency: {
    transaction: 'required',
    concurrency: 'partitioned',
    concurrencyKey: (input) => input.locationId,
    expectedVersion: (input) =>
      `${input.fulfillmentVersion}:${input.projectionHash}`,
  },
  idempotency: {
    required: true,
    key: (input) => input.idempotencyKey,
  },
  consumes: applyFulfillmentDemandConsumedMessages,
  emits: [],
  retry: {
    maxAttempts: 8,
    strategy: 'bounded-exponential-jitter',
    deadLetter: 'retain',
  },
  surfaces: [applyFulfillmentDemandJobSurface],
  observability: { operation: 'production.apply_fulfillment_demand' },
});

export const makeApplyFulfillmentDemandCell = <StoredWorkEvent>(
  deps: ApplyFulfillmentDemandDependencies<StoredWorkEvent>,
) =>
  defineOperation(
    applyFulfillmentDemandCellDeclaration,
    makeExecuteApplyFulfillmentDemand(deps),
  );
