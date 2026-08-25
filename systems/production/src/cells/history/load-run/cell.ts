import { bindCell, declareQueryCell } from '@pressly/cells';
import type { ProductionHistoryRunDetail } from '../../../read-models/production-history/contract.ts';
import { loadHistoryRunContract } from './contract.ts';
import {
  makeExecuteLoadHistoryRun,
  type LoadHistoryRunDependencies,
} from './execute.ts';
import {
  loadHistoryRunOperationId,
  type LoadHistoryRunExpectedFailure,
  type LoadHistoryRunInput,
} from './types.ts';

export const loadHistoryRunCellDeclaration = declareQueryCell<
  LoadHistoryRunInput,
  ProductionHistoryRunDetail,
  LoadHistoryRunExpectedFailure
>({
  id: loadHistoryRunOperationId,
  authentication: 'none',
  contract: loadHistoryRunContract,
  consistency: { transaction: 'required', concurrency: 'none' },
  surfaces: [],
  observability: { operation: 'production.load_history_run' },
});

export const makeLoadHistoryRunCell = (
  dependencies: LoadHistoryRunDependencies,
) =>
  bindCell(
    loadHistoryRunCellDeclaration,
    makeExecuteLoadHistoryRun(dependencies),
  );
