import { defineOperation } from '@pressly/cells';
import { manageResourcesContract } from './contract.ts';
import {
  makeExecuteManageResources,
  type ManageResourcesDependencies,
} from './execute.ts';
import type {
  ManageResourcesCommand,
  ManageResourcesExpectedFailure,
  ManageResourcesResult,
} from './types.ts';
import { manageResourcesOperationId } from './types.ts';

export const manageResourcesCellDeclaration = defineOperation<
  ManageResourcesCommand,
  ManageResourcesResult,
  ManageResourcesExpectedFailure
>({
  kind: 'command',
  id: manageResourcesOperationId,
  authentication: 'none',
  contract: manageResourcesContract,
  consistency: {
    transaction: 'required',
    concurrency: 'partitioned',
    concurrencyKey: (input) => input.manifest.location.id,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: [],
  emits: [],
  consumes: [],
  observability: { operation: 'production.manage_resources' },
});

export const makeManageResourcesCell = <StoredWorkEvent>(
  deps: ManageResourcesDependencies<StoredWorkEvent>,
) =>
  defineOperation(
    manageResourcesCellDeclaration,
    makeExecuteManageResources(deps),
  );
