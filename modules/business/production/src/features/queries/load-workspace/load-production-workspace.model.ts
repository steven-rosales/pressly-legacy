import type {
  ProductionBoard,
  ProductionBoardRun,
} from '../../../foundations/language/board/production-board-read.model.ts';
import type { ProductionOrderListItem } from '../../../foundations/language/orders/production-order-list-item.model.ts';
import type {
  ProductionPendingOrder,
  ProductionPlacementFailureReason,
  ProductionPlacementTarget,
} from '../../../foundations/language/scheduling/production-placement.model.ts';
import type { DemandForecastOutput } from '../../../foundations/language/scheduling/production-scheduling.model.ts';
import type { ScheduleProposal } from '../../../foundations/language/scheduling/schedule-proposal.entity.ts';
import type { SchedulerConfig } from '../../../foundations/language/scheduling/scheduler-config.model.ts';

export type LoadProductionWorkspaceCommand = Readonly<{
  locationId: string;
  shiftId?: string;
}>;

export type ProductionLivePlacementCapacity = Readonly<{
  beforeLbs: number;
  afterLbs: number;
  limitLbs: number;
}>;

type ProductionLivePlacementProjection = Readonly<{
  proposalHash: string;
  expectedQueueVersion: number;
  expectedOrderVersion: number;
  capacity: ProductionLivePlacementCapacity;
  projectedCompletionAt: string;
  overtime: Readonly<{
    required: boolean;
    minutes: number;
    shiftEndsAt: string;
  }>;
}>;

export type ProductionLiveAutomaticPlacement =
  ProductionLivePlacementProjection &
    Readonly<{
      mode: 'automatic';
      target: ProductionPlacementTarget;
      expectedBatchVersion: number | null;
      allowedActions: readonly ['place_automatically' | 'confirm_overtime'];
    }>;

export type ProductionLiveExactBatchTarget = ProductionLivePlacementProjection &
  Readonly<{
    mode: 'manager_exact';
    target: Readonly<{
      kind: 'existing_batch';
      productionBatchId: string;
      sequence: number;
    }>;
    expectedBatchVersion: number;
    allowedActions: readonly ['place_exactly' | 'confirm_overtime'];
  }>;

export type ProductionLiveRecommendedPlacement =
  | Readonly<{
      status: 'available';
      placement: ProductionLiveAutomaticPlacement;
    }>
  | Readonly<{
      status: 'unavailable';
      reason: ProductionPlacementFailureReason;
      message: string;
    }>;

export type ProductionLiveRunChangeOrder = ProductionPendingOrder &
  Readonly<{
    recommendedPlacement: ProductionLiveRecommendedPlacement;
    exactBatchTargets: readonly ProductionLiveExactBatchTarget[];
  }>;

export type ProductionLiveRunChanges = Readonly<{
  productionRunId: string;
  queueVersion: number;
  pulseCapacityLbs: number;
  orders: readonly ProductionLiveRunChangeOrder[];
}>;

export type ProductionWorkspaceLocation = Readonly<{
  id: string;
  name: string;
  timezone: string;
  isActive: boolean;
}>;

export type ProductionWorkspaceShift = Readonly<{
  id: string;
  locationId: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  effectiveFolderCount: number;
  status: 'draft' | 'open' | 'closed';
  version: number;
}>;

export type ProductionWorkspaceShiftSelection = Readonly<{
  productionShiftId: string;
  version: number;
  selectedOrderIds: readonly string[];
}>;

export type ProductionWorkspaceShiftCandidate = Readonly<{
  productionShiftId: string;
  startsAt: Date;
  endsAt: Date;
  reason: 'started_run' | 'accepted_plan' | 'open_shift';
  productionRunId: string | null;
  scheduleRunId: string | null;
}>;

export type ProductionWorkspaceStation = Readonly<{
  id: string;
  locationId: string;
  kind: 'sorting' | 'washing' | 'drying' | 'folding_packaging';
  label: string;
  sortOrder: number;
  isActive: boolean;
}>;

export type ProductionWorkspaceMachine = Readonly<{
  id: string;
  stationKind: 'washing' | 'drying';
  label: string;
  effectiveCapacityLbs: number;
  active: boolean;
}>;

export type ProductionDemandOutlookItem = Readonly<{
  orderDemandId: string;
  productionOrderId: string | null;
  externalOrderId: string;
  phase:
    | 'expected'
    | 'inbound'
    | 'production_released'
    | 'post_production'
    | 'withdrawn';
  dueAt: Date;
  estimatedWeightLbs: number | null;
  readiness:
    | 'awaiting_release'
    | 'awaiting_intake'
    | 'ready'
    | 'in_production'
    | 'finished'
    | 'not_admitted';
  productionStatus:
    | 'release_pending'
    | 'intake_pending'
    | 'eligible'
    | 'ineligible'
    | 'scheduled'
    | 'finished'
    | null;
  bagCount: number | null;
}>;

export type ProductionDemandOutlook = Readonly<{
  productionShiftId: string;
  horizonCutoffAt: Date;
  totalOrderCount: number;
  totalEstimatedWeightLbs: number;
  estimateMissingOrderCount: number;
  expectedOrderCount: number;
  expectedEstimatedWeightLbs: number;
  readyOrderCount: number;
  readyEstimatedWeightLbs: number;
  inProductionOrderCount: number;
  inProductionEstimatedWeightLbs: number;
  items: readonly ProductionDemandOutlookItem[];
  forecast: DemandForecastOutput | null;
}>;

export type ProductionWorkspaceModel = Readonly<{
  location: ProductionWorkspaceLocation;
  currentShift: ProductionWorkspaceShift | null;
  shiftSelection: ProductionWorkspaceShiftSelection | null;
  candidateShifts: readonly ProductionWorkspaceShiftCandidate[];
  currentSchedulerConfig: SchedulerConfig | null;
  currentScheduleProposal: ScheduleProposal | null;
  activeRuns: readonly ProductionBoardRun[];
  orders: readonly ProductionOrderListItem[];
  pendingEligibleOrders: readonly ProductionPendingOrder[];
  liveRunChanges: ProductionLiveRunChanges | null;
  demandOutlook: ProductionDemandOutlook | null;
  board: ProductionBoard | null;
  stations: readonly ProductionWorkspaceStation[];
  machines: readonly ProductionWorkspaceMachine[];
  asOf: Date;
}>;
