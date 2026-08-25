import { bindCell, declareQueryCell } from '@pressly/cells';
import type { ListProductionOrderControlResult } from '../../../read-models/production-order-control/contract.ts';
import { listOrderControlContract } from './contract.ts';
import {
  makeExecuteListOrderControl,
  type ListOrderControlDependencies,
} from './execute.ts';
import {
  listOrderControlOperationId,
  type ListOrderControlExpectedFailure,
  type ListOrderControlInput,
} from './types.ts';

export const listOrderControlCellDeclaration = declareQueryCell<
  ListOrderControlInput,
  ListProductionOrderControlResult,
  ListOrderControlExpectedFailure
>({
  id: listOrderControlOperationId,
  authentication: 'none',
  contract: listOrderControlContract,
  consistency: { transaction: 'none', concurrency: 'none' },
  surfaces: [],
  observability: { operation: 'production.list_order_control' },
});

export const makeListOrderControlCell = (
  dependencies: ListOrderControlDependencies,
) =>
  bindCell(
    listOrderControlCellDeclaration,
    makeExecuteListOrderControl(dependencies),
  );
