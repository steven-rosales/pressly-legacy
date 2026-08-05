import type {
  ProductionBoardIdentitySource,
  ProductionOrderIdentitySource,
} from '../../../foundations/language/operational-order/operational-order.model.ts';

export type ProductionWorkspaceIdentitySource = Readonly<{
  orders: readonly ProductionOrderIdentitySource[];
  pendingEligibleOrders: readonly ProductionOrderIdentitySource[];
  liveRunChanges: Readonly<{
    orders: readonly ProductionOrderIdentitySource[];
  }> | null;
  board: ProductionBoardIdentitySource | null;
}>;
