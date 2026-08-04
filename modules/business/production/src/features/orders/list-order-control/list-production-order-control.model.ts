import type {
  ProductionOrderDueBucket,
  ProductionOrderListItem,
  ProductionOrderStatus,
} from '../../../foundations/language/orders/production-order-list-item.model.ts';
import type {
  ProductionOrderResolutionAvailability,
  ProductionOrderRouteReason,
} from '../../../foundations/language/execution/production-lifecycle.model.ts';
import type {
  OrderRoutingRejectionCode,
  OrderRoutingStage,
  QueuedMoveTargetDecision,
} from '../../../foundations/language/order-routing/order-routing.policy.ts';

export type ListProductionOrderControlCommand = Readonly<{
  locationId: string;
  view: 'attention' | 'active' | 'intake' | 'all';
  search?: string;
  status?: ProductionOrderStatus;
  dueBucket?: ProductionOrderDueBucket;
  productionRunId?: string;
  productionBatchId?: string;
  stage?: OrderRoutingStage;
  priority?: boolean;
  movable?: boolean;
  cursor?: string;
  limit: number;
}>;

export type ProductionOrderRouteAttempt = Readonly<{
  id: string;
  productionRunId: string;
  stageRunId: string;
  productionBatchId: string;
  batchSequence: number;
  batchStatus:
    | 'queued'
    | 'sorting'
    | 'washing'
    | 'drying'
    | 'folding_packaging'
    | 'finished';
  stage: OrderRoutingStage;
  stageStatus: 'planned' | 'started' | 'completed';
  attemptNumber: number;
  status: 'assigned' | 'completed' | 'released';
  assignmentReason:
    | 'initial_schedule'
    | 'automatic'
    | 'manager_exact'
    | ProductionOrderRouteReason;
  assignedAt: Date;
  assignedBy: string | null;
  completedAt: Date | null;
  completedBy: string | null;
  releasedAt: Date | null;
  releasedBy: string | null;
  releaseReason: ProductionOrderRouteReason | null;
}>;

export type ProductionOrderRouteCommandDenialCode =
  | 'PRODUCTION_ORDER_ROUTE_NOT_FOUND'
  | 'PRODUCTION_RUN_NOT_STARTED'
  | 'PRODUCTION_ORDER_RESOLVED'
  | 'PRODUCTION_ORDER_RESOLUTION_STATE_INVALID'
  | 'PRODUCTION_ORDER_EXECUTION_STATE_INVALID'
  | 'PRODUCTION_ORDER_NOT_SCHEDULED'
  | 'SOURCE_BATCH_WOULD_BE_EMPTY'
  | OrderRoutingRejectionCode;

export type ProductionQueuedMoveTarget = Readonly<{
  productionBatchId: string;
  batchSequence: number;
  batchStatus: ProductionOrderRouteAttempt['batchStatus'];
  membershipFrozen: boolean;
  expectedBatchVersion: number;
  currentWeightLbs: number;
  projectedWeightLbs: number;
  capacityLbs: number;
  feasibility:
    | Readonly<{ status: 'allowed' }>
    | Readonly<{
        status: 'blocked';
        code: Extract<
          QueuedMoveTargetDecision,
          { decision: 'blocked' }
        >['code'];
      }>;
}>;

type ProductionOrderRouteCapabilityVersions = Readonly<{
  expectedQueueVersion: number;
  expectedOrderVersion: number;
  expectedSourceBatchVersion: number;
}>;

export type ProductionOrderCommandCapabilities = Readonly<{
  queuedMove:
    | (Readonly<{
        status: 'allowed';
        targets: readonly ProductionQueuedMoveTarget[];
      }> &
        ProductionOrderRouteCapabilityVersions)
    | Readonly<{
        status: 'blocked';
        code: ProductionOrderRouteCommandDenialCode;
        targets: readonly ProductionQueuedMoveTarget[];
      }>;
  routeException:
    | (Readonly<{ status: 'allowed' }> & ProductionOrderRouteCapabilityVersions)
    | Readonly<{
        status: 'blocked';
        code: ProductionOrderRouteCommandDenialCode;
      }>;
}>;

export type ProductionOrderControlItem = Readonly<{
  order: ProductionOrderListItem;
  admission: Readonly<{
    sourceState: 'unreleased' | 'released' | 'withdrawn';
    override: 'released' | null;
    effectiveState: 'unreleased' | 'released' | 'withdrawn';
    allowedActions: readonly ('release' | 'return_to_source')[];
  }>;
  attention: Readonly<{
    reason:
      | 'intake_required'
      | 'placement_pending'
      | 'placement_conflict'
      | 'route_blocked';
    message: string;
  }> | null;
  currentPlacement: Readonly<{
    productionRunId: string;
    productionBatchId: string;
    batchSequence: number;
    batchStatus: ProductionOrderRouteAttempt['batchStatus'];
    batchVersion: number;
    queueVersion: number;
    membershipFrozen: boolean;
    placementProvenance:
      | 'initial_schedule'
      | 'automatic'
      | 'manager_exact'
      | 'manual_rebatch'
      | 'exception_route';
    pinnedAt: Date | null;
    pinnedBy: string | null;
  }> | null;
  nextRequiredStage: OrderRoutingStage | null;
  routeAttempts: readonly ProductionOrderRouteAttempt[];
  commands: ProductionOrderCommandCapabilities;
  resolutionAction: ProductionOrderResolutionAvailability;
}>;

export type ListProductionOrderControlResult = Readonly<{
  items: readonly ProductionOrderControlItem[];
  counts: Readonly<{
    attention: number;
    active: number;
    all: number;
  }>;
  nextCursor: string | null;
  asOf: Date;
}>;

export type ProductionOrderControlCursorPoint = Readonly<{
  dueAt: Date;
  id: string;
}>;
