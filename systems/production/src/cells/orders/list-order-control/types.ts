import type {
  OrderRoutingCurrentStageInput,
  OrderRoutingInput,
  OrderRoutingRejectionCode,
  OrderRoutingStage,
  ProductionOrderResolutionAvailability,
  ProductionOrderRouteReason,
  QueuedMoveTargetDecision,
} from '../../../model/public.ts';

export const listOrderControlOperationId =
  'production.list-order-control.v1' as const;

export type ProductionOrderStatus =
  | 'release_pending'
  | 'intake_pending'
  | 'eligible'
  | 'ineligible'
  | 'scheduled'
  | 'finished';
export type ProductionOrderDueBucket =
  | 'overdue'
  | 'today'
  | 'tomorrow'
  | 'later';
export type ProductionBagCountProvenance =
  | 'external_source'
  | 'operator_intake';

export type ListOrderControlInput = Readonly<{
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

export type ProductionOrder = Readonly<{
  id: string;
  locationId: string;
  externalOrderId: string;
  dueAt: Date;
  dueBucket: ProductionOrderDueBucket;
  priority: boolean;
  status: ProductionOrderStatus;
  derivedWeightLbs: number;
  bagCount: number | null;
  bagCountProvenance: ProductionBagCountProvenance | null;
  intakeVersion: number | null;
  version: number;
}>;

export type OrderControlPersistenceRow = Readonly<{
  id: string;
  locationId: string;
  externalOrderId: string;
  dueAt: Date;
  priority: boolean;
  status: string;
  derivedWeightLbs: number;
  bagCount: number | null;
  bagCountSource: string | null;
  intakeVersion: number;
  intakeRecordedAt: Date | null;
  version: number;
  resolutionState: string;
  executionStatus: string;
  pendingPlacement: unknown;
  admissionOverride: string | null;
  admissionState: string;
  productionBatchId: string | null;
  placementProvenance: string | null;
  pinnedAt: Date | null;
  pinnedBy: string | null;
  batchSequence: number | null;
  batchStatus: string | null;
  batchVersion: number | null;
  membershipFrozenAt: Date | null;
  productionRunId: string | null;
  productionRunStatus: string | null;
  queueVersion: number | null;
  selectedForShift: boolean;
  resolutionHasShiftSelection: boolean;
  hasBatchMembership: boolean;
  hasStageAttempt: boolean;
  hasRoute: boolean;
}>;

export type RoutableBatchStatus =
  | 'queued'
  | 'sorting'
  | 'washing'
  | 'drying'
  | 'folding_packaging'
  | 'finished';

export type ProductionOrderRouteAttempt = Readonly<{
  id: string;
  productionRunId: string;
  stageRunId: string;
  productionBatchId: string;
  batchSequence: number;
  batchStatus: RoutableBatchStatus;
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

export type RoutingBatch = OrderRoutingInput['targetCandidates'][number] &
  Readonly<{
    version: number;
    derivedWeightLbs: number;
    pulseCapacityLbs: number;
  }>;

export type ProductionQueuedMoveTarget = Readonly<{
  productionBatchId: string;
  batchSequence: number;
  batchStatus: RoutableBatchStatus;
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

type RouteCapabilityVersions = Readonly<{
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
        RouteCapabilityVersions)
    | Readonly<{
        status: 'blocked';
        code: ProductionOrderRouteCommandDenialCode;
        targets: readonly ProductionQueuedMoveTarget[];
      }>;
  routeException:
    | (Readonly<{ status: 'allowed' }> & RouteCapabilityVersions)
    | Readonly<{
        status: 'blocked';
        code: ProductionOrderRouteCommandDenialCode;
      }>;
}>;

export type ProductionOrderCommandCapabilityContext = Readonly<{
  order: Readonly<{
    id: string;
    operationalStatus: string;
    executionStatus: string;
    resolutionState: string;
    version: number;
    weightLbs: number;
  }>;
  run: Readonly<{
    id: string;
    status: string;
    queueVersion: number;
  }> | null;
  source:
    | (RoutingBatch &
        Readonly<{
          activeOrderCount: number;
        }>)
    | null;
  sourceAttempts: OrderRoutingCurrentStageInput['attempts'];
  candidates: readonly RoutingBatch[];
}>;

export type ProductionOrderControlItem = Readonly<{
  order: ProductionOrder;
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
    batchStatus: RoutableBatchStatus;
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

export type ListOrderControlResult = Readonly<{
  items: readonly ProductionOrderControlItem[];
  counts: Readonly<{ attention: number; active: number; all: number }>;
  nextCursor: string | null;
  asOf: Date;
}>;

export type OrderControlCursorPoint = Readonly<{
  dueAt: Date;
  id: string;
}>;

export type ListOrderControlRepositoryResult =
  | Readonly<{ kind: 'found'; result: ListOrderControlResult }>
  | Readonly<{ kind: 'location_not_found' }>
  | Readonly<{ kind: 'invalid_cursor' }>;

export type ListOrderControlRepository = Readonly<{
  list: (
    input: ListOrderControlInput,
    asOf: Date,
  ) => Promise<ListOrderControlRepositoryResult>;
}>;

export type ListOrderControlLocationNotFound = Readonly<{
  tag: 'ProductionFailure';
  kind: 'not_found';
  code: 'production_location_not_found';
  message: 'The production location was not found.';
  safeMessage: 'The production location was not found.';
}>;
export type ListOrderControlCursorInvalid = Readonly<{
  tag: 'ProductionFailure';
  kind: 'validation';
  classification: 'malformed';
  code: 'production_order_cursor_invalid';
  message: 'The production-order cursor is invalid.';
  safeMessage: 'The production-order cursor is invalid.';
}>;
export type ListOrderControlExpectedFailure =
  | ListOrderControlLocationNotFound
  | ListOrderControlCursorInvalid;
