import type { ProductionOrderRouteReason } from '../execution.ts';
import type { OrderRoutingStage } from '../order-routing.ts';
import type { ProductionRules } from '../rules.ts';

type OrderRouteProposalIdentity = Readonly<{
  locationId: string;
  productionRunId: string;
  productionOrderId: string;
  actorId: string;
  authorizedAction: 'production:stage';
}>;

type OrderRouteProposalVersions = Readonly<{
  expectedQueueVersion: number;
  expectedOrderVersion: number;
  expectedSourceBatchVersion: number;
}>;

type QueuedOrderRouteProposal = Readonly<{
  kind: 'queued_move';
  reason: 'manual_rebatch';
  targetProductionBatchId: string;
  restartStage: 'sorting';
}>;

type ExceptionOrderRouteProposal = Readonly<{
  kind: 'exception';
  reason: Exclude<ProductionOrderRouteReason, 'manual_rebatch'>;
  restartStage: OrderRoutingStage;
  note?: string;
}>;

export type OrderRouteProposalCommand = OrderRouteProposalIdentity &
  OrderRouteProposalVersions &
  (QueuedOrderRouteProposal | ExceptionOrderRouteProposal);

export type ProductionOrderRouteProposal = Readonly<{
  kind: OrderRouteProposalCommand['kind'];
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

export type OrderRouteProposalConflictFailure = Readonly<{
  kind: 'conflict';
  code: string;
  message: string;
  safeMessage: string;
}>;

export type OrderRouteProposalValidationFailure = Readonly<{
  kind: 'validation';
  classification: 'semantic';
  code: string;
  message: string;
  safeMessage: string;
}>;

export type OrderRouteProposalFailure =
  | OrderRouteProposalConflictFailure
  | OrderRouteProposalValidationFailure;

export type OrderRouteProposalContext = Readonly<{
  run: Readonly<{
    id: string;
    status: string;
    queueVersion: number;
  }>;
  order: Readonly<{
    id: string;
    operationalStatus: string;
    executionStatus: string;
    resolutionState: string;
    version: number;
    weightLbs: number;
  }>;
  source: Readonly<{
    membershipId: string;
    productionBatchId: string;
    sequence: number;
    status: string;
    membershipFrozen: boolean;
    version: number;
    derivedWeightLbs: number;
    activeOrderCount: number;
  }>;
  candidates: readonly Readonly<{
    productionBatchId: string;
    sequence: number;
    status: string;
    membershipFrozen: boolean;
    version: number;
    derivedWeightLbs: number;
    pulseCapacityLbs: number;
    stages: readonly Readonly<{
      stageRunId: string;
      stage: OrderRoutingStage;
      status: 'planned' | 'started' | 'completed';
      assignedWeightLbs: number;
      capacityLbs: number;
    }>[];
  }>[];
  attempts: readonly Readonly<{
    id: string;
    stageRunId: string;
    productionBatchId: string;
    stage: OrderRoutingStage;
    attemptNumber: number;
    status: 'assigned' | 'completed' | 'released';
  }>[];
}>;

export type OrderRouteProposalPolicy = Pick<
  ProductionRules,
  | 'evaluateProductionOrderOperationalAccess'
  | 'resolveProductionOrderExecutionState'
  | 'deriveOrderRoutingCurrentStage'
  | 'evaluateOrderRouting'
>;

export type OrderRouteProposalDecision =
  | Readonly<{ kind: 'propose'; proposal: ProductionOrderRouteProposal }>
  | Readonly<{ kind: 'reject'; failure: OrderRouteProposalFailure }>;
