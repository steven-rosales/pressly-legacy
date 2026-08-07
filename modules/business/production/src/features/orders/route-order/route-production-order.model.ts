import type { ProductionOrderRouteReason } from '../../../foundations/language/execution/production-lifecycle.model.ts';
import type { OrderRoutingStage } from '../../../foundations/language/order-routing/order-routing.policy.ts';

type ProductionOrderRoutingIdentity = Readonly<{
  locationId: string;
  productionRunId: string;
  productionOrderId: string;
  actorId: string;
  authorizedAction: 'production:stage';
}>;

type ProductionOrderRoutingVersions = Readonly<{
  expectedQueueVersion: number;
  expectedOrderVersion: number;
  expectedSourceBatchVersion: number;
}>;

type QueuedProductionOrderMove = Readonly<{
  kind: 'queued_move';
  reason: 'manual_rebatch';
  targetProductionBatchId: string;
  restartStage: 'sorting';
}>;

type ProductionOrderRouteException = Readonly<{
  kind: 'exception';
  reason: Exclude<ProductionOrderRouteReason, 'manual_rebatch'>;
  restartStage: OrderRoutingStage;
  note?: string;
}>;

export type PreviewProductionOrderRouteCommand =
  ProductionOrderRoutingIdentity &
    ProductionOrderRoutingVersions &
    (QueuedProductionOrderMove | ProductionOrderRouteException);

export type CommitProductionOrderRouteCommand =
  PreviewProductionOrderRouteCommand &
    Readonly<{
      proposalHash: string;
      idempotencyKey: string;
    }>;

export type ProductionOrderRouteProposal = Readonly<{
  kind: PreviewProductionOrderRouteCommand['kind'];
  productionRunId: string;
  productionOrderId: string;
  sourceProductionBatchId: string;
  sourceBatchSequence: number;
  targetProductionBatchId: string;
  targetBatchSequence: number;
  restartStage: OrderRoutingStage;
  releasedStages: readonly OrderRoutingStage[];
  assignedStages: readonly OrderRoutingStage[];
  orderWeightLbs: number;
  targetWeightLbs: number;
  targetCapacityLbs: number;
  expectedQueueVersion: number;
  expectedOrderVersion: number;
  expectedSourceBatchVersion: number;
  expectedTargetBatchVersion: number;
  proposalHash: string;
}>;

export type CommitProductionOrderRouteResult = Readonly<{
  status: 'routed';
  proposal: ProductionOrderRouteProposal;
  queueVersion: number;
  orderVersion: number;
  sourceBatchVersion: number;
  targetBatchVersion: number;
  createdAttemptIds: readonly string[];
  replayed: boolean;
}>;
