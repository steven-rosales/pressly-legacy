import type { ProductionFeatureFailure } from '../../../foundations/language/failures/production-feature.failure.ts';
import type { Result } from '@pressly/kernel';
import type { ProductionBoardProjection } from '../../../foundations/language/board/production-board-read.model.ts';
import type {
  ProductionLiveRunPlacementOrder,
  ProductionRunPlacementContext,
} from '../../../foundations/language/scheduling/online-placement.model.ts';
import type {
  LoadProductionWorkspaceCommand,
  ProductionWorkspaceModel,
} from './load-production-workspace.model.ts';

export type ProductionWorkspaceReadModel = Readonly<{
  workspace: Omit<ProductionWorkspaceModel, 'board'> &
    Readonly<{ board: null }>;
  boardProjection: ProductionBoardProjection | null;
  demandOutlookRows: readonly DemandOutlookRow[];
  livePlacement: Readonly<{
    runContext: ProductionRunPlacementContext;
    orders: readonly ProductionLiveRunPlacementOrder[];
  }> | null;
}>;

export type DemandOutlookRow = Readonly<{
  orderDemandId: string;
  productionOrderId: string | null;
  externalOrderId: string;
  phase: string;
  dueAt: Date;
  estimatedWeightLbs: number | null;
  priority: boolean;
  productionStatus: string | null;
  bagCount: number | null;
}>;

export type LoadProductionWorkspace = (
  command: LoadProductionWorkspaceCommand,
) => Promise<Result<ProductionWorkspaceModel, ProductionFeatureFailure>>;

export type LoadProductionWorkspaceRepository = Readonly<{
  loadWorkspace: (
    locationId: string,
    shiftId: string | undefined,
    now: Date,
  ) => Promise<ProductionWorkspaceReadModel | 'shift_not_found' | null>;
}>;
