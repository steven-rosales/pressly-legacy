import { bindCell, declareQueryCell } from '@pressly/cells';
import type { ListProductionHistoryActivityResult } from '../../../read-models/production-history/contract.ts';
import { listHistoryActivityContract } from './contract.ts';
import {
  makeExecuteListHistoryActivity,
  type ListHistoryActivityDependencies,
} from './execute.ts';
import {
  listHistoryActivityOperationId,
  type ListHistoryActivityExpectedFailure,
  type ListHistoryActivityInput,
} from './types.ts';

export const listHistoryActivityCellDeclaration = declareQueryCell<
  ListHistoryActivityInput,
  ListProductionHistoryActivityResult,
  ListHistoryActivityExpectedFailure
>({
  id: listHistoryActivityOperationId,
  contract: listHistoryActivityContract,
  authorization: {
    capability: 'production:read',
    timing: 'after-input',
    scope: (input) => input.locationId,
  },
  consistency: { transaction: 'required', concurrency: 'none' },
  surfaces: [],
  observability: { operation: 'production.list_history_activity' },
});

export const makeListHistoryActivityCell = (
  dependencies: ListHistoryActivityDependencies,
) =>
  bindCell(
    listHistoryActivityCellDeclaration,
    makeExecuteListHistoryActivity(dependencies),
  );
