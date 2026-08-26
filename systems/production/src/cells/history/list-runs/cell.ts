import type { ListProductionHistoryRunsResult } from '../../../read-models/production-history/contract.ts';
import { defineOperation } from '@pressly/cells';
import { listHistoryRunsContract } from './contract.ts';
import {
  makeExecuteListHistoryRuns,
  type ListHistoryRunsDependencies,
} from './execute.ts';
import { listHistoryRunsHttpSurfaces } from './http.ts';
import {
  listHistoryRunsOperationId,
  type ListHistoryRunsExpectedFailure,
  type ListHistoryRunsInput,
} from './types.ts';

export const listHistoryRunsCellDeclaration = defineOperation<
  ListHistoryRunsInput,
  ListProductionHistoryRunsResult,
  ListHistoryRunsExpectedFailure
>({
  kind: 'query',
  id: listHistoryRunsOperationId,
  contract: listHistoryRunsContract,
  authorization: {
    capability: 'production:read',
    timing: 'after-input',
    scope: (input) => input.locationId,
  },
  consistency: { transaction: 'required', concurrency: 'none' },
  surfaces: listHistoryRunsHttpSurfaces,
  observability: { operation: 'production.list_history_runs' },
});

export const makeListHistoryRunsCell = (
  dependencies: ListHistoryRunsDependencies,
) =>
  defineOperation(
    listHistoryRunsCellDeclaration,
    makeExecuteListHistoryRuns(dependencies),
  );
