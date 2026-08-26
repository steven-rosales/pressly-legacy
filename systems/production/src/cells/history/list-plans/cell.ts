import type { ListProductionHistoryPlansResult } from '../../../read-models/production-history/contract.ts';
import { defineOperation } from '@pressly/cells';
import { listHistoryPlansContract } from './contract.ts';
import {
  makeExecuteListHistoryPlans,
  type ListHistoryPlansDependencies,
} from './execute.ts';
import { listHistoryPlansHttpSurfaces } from './http.ts';
import {
  listHistoryPlansOperationId,
  type ListHistoryPlansExpectedFailure,
  type ListHistoryPlansInput,
} from './types.ts';

export const listHistoryPlansCellDeclaration = defineOperation<
  ListHistoryPlansInput,
  ListProductionHistoryPlansResult,
  ListHistoryPlansExpectedFailure
>({
  kind: 'query',
  id: listHistoryPlansOperationId,
  contract: listHistoryPlansContract,
  authorization: {
    capability: 'production:read',
    timing: 'after-input',
    scope: (input) => input.locationId,
  },
  consistency: {
    transaction: 'required',
    concurrency: 'none',
  },
  surfaces: listHistoryPlansHttpSurfaces,
  observability: { operation: 'production.list_history_plans' },
});

export const makeListHistoryPlansCell = (
  dependencies: ListHistoryPlansDependencies,
) =>
  defineOperation(
    listHistoryPlansCellDeclaration,
    makeExecuteListHistoryPlans(dependencies),
  );
