import type { ProductionWorkspace } from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  ProductionLiveRunPlacementOrder,
  ProductionRunPlacementContext,
} from '../production.port.ts';
import type { ProductionBoardProjection } from '../production-board-read.policy.ts';

export type ProductionWorkspaceReadModel = Readonly<{
  workspace: ProductionWorkspace & Readonly<{ board: null }>;
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

export type LoadProductionWorkspace = (command: {
  locationId: string;
  shiftId?: string;
}) => Promise<Result<ProductionWorkspace, AppError>>;

export type LoadProductionWorkspaceRepository = Readonly<{
  loadWorkspace: (
    locationId: string,
    shiftId: string | undefined,
    now: Date,
  ) => Promise<ProductionWorkspaceReadModel | 'shift_not_found' | null>;
}>;
