import { bindCell, declareQueryCell } from '@pressly/cells';
import type { ProductionOrderBacklogPreview } from '../../../read-models/production-order-backlog/contract.ts';
import type { ProductionOrderBacklogScope } from '../../../read-models/production-order-backlog/model.ts';
import { previewOrderBacklogContract } from './contract.ts';
import {
  makeExecutePreviewOrderBacklog,
  type PreviewOrderBacklogDependencies,
} from './execute.ts';
import {
  previewOrderBacklogOperationId,
  type PreviewOrderBacklogExpectedFailure,
} from './types.ts';

export const previewOrderBacklogCellDeclaration = declareQueryCell<
  ProductionOrderBacklogScope,
  ProductionOrderBacklogPreview,
  PreviewOrderBacklogExpectedFailure
>({
  id: previewOrderBacklogOperationId,
  authentication: 'none',
  contract: previewOrderBacklogContract,
  consistency: { transaction: 'none', concurrency: 'none' },
  surfaces: [],
  observability: { operation: 'production.preview_order_backlog' },
});

export const makePreviewOrderBacklogCell = (
  dependencies: PreviewOrderBacklogDependencies,
) =>
  bindCell(
    previewOrderBacklogCellDeclaration,
    makeExecutePreviewOrderBacklog(dependencies),
  );
