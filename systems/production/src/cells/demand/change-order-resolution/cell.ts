import { defineOperation } from '@pressly/cells';
import { changeOrderResolutionContract } from './contract.ts';
import { changeOrderResolutionOperationId } from './decide.ts';
import {
  makeExecuteChangeOrderResolution,
  type ChangeOrderResolutionDependencies,
} from './execute.ts';
import { changeOrderResolutionHttpSurfaces } from './http.ts';
import type {
  ChangeOrderResolutionCommand,
  ChangeOrderResolutionExpectedFailure,
  ChangeOrderResolutionResult,
} from './types.ts';

export const changeOrderResolutionCellDeclaration = defineOperation<
  ChangeOrderResolutionCommand,
  ChangeOrderResolutionResult,
  ChangeOrderResolutionExpectedFailure
>({
  kind: 'command',
  id: changeOrderResolutionOperationId,
  contract: changeOrderResolutionContract,
  authorization: {
    capability: 'production:override',
    timing: 'after-input',
    scope: (input) => input.locationId,
  },
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    expectedVersion: (input) => input.expectedVersion,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: changeOrderResolutionHttpSurfaces,
  emits: [],
  consumes: [],
  observability: { operation: 'production.change_order_resolution' },
});

export const makeChangeOrderResolutionCell = <StoredWorkEvent>(
  deps: ChangeOrderResolutionDependencies<StoredWorkEvent>,
) =>
  defineOperation(
    changeOrderResolutionCellDeclaration,
    makeExecuteChangeOrderResolution(deps),
  );
