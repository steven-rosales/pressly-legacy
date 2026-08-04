import type { OnlinePlacementInput } from '../../../foundations/language/scheduling/online-placement.model.ts';

export type LoadRemainingDayForecastCommand = Readonly<{
  locationId: string;
  serviceDay: string;
}>;

export type RemainingDayForecastDemandRow = Readonly<{
  orderDemandId: string;
  productionOrderId: string | null;
  displayReference: string;
  admissionState: string;
  phase: string;
  dueAt: Date;
  estimatedWeightLbs: number | null;
  priority: boolean;
  operationalStatus: string | null;
  executionStatus: string | null;
  admissionOverride: string | null;
  derivedWeightLbs: number | null;
  bagCount: number | null;
  productionOrderVersion: number | null;
  activePlacement: Readonly<{
    productionRunId: string;
    productionBatchId: string;
  }> | null;
}>;

export type RemainingDayForecastReadModel = Readonly<{
  locationId: string;
  timezone: string;
  serviceDay: string;
  startsAt: Date;
  endsAt: Date;
  asOf: Date;
  demandRows: readonly RemainingDayForecastDemandRow[];
  shifts: readonly Readonly<{
    productionShiftId: string;
    startsAt: Date;
    endsAt: Date;
    status: 'draft' | 'open' | 'closed';
    activeRunId: string | null;
  }>[];
  activeRuns: readonly Readonly<{
    run: OnlinePlacementInput['run'];
    machines: OnlinePlacementInput['machines'];
    batches: OnlinePlacementInput['batches'];
  }>[];
}>;

type ProductionForecastMonitorActionability = Readonly<{
  action: 'monitor';
  state: 'informational';
  reason:
    | 'already_in_production'
    | 'awaiting_source_release'
    | 'missing_estimate';
}>;

type ProductionForecastOpenActionability = Readonly<{
  action: 'open_production';
  state: 'available';
  reason: 'already_in_production';
}>;

type ProductionForecastIntakeActionability = Readonly<{
  action: 'record_intake';
  state: 'available';
  reason: 'physical_intake_required';
}>;

type ProductionForecastReleaseActionability = Readonly<{
  action: 'release_to_production';
  state: 'available';
  reason: 'manual_release_available';
}>;

type ProductionForecastPlacementActionability = Readonly<{
  action: 'place_in_active_run';
  state: 'available';
  reason: 'ready_for_placement';
}>;

type ProductionForecastPlacementReviewActionability = Readonly<{
  action: 'review_placement';
  state: 'available';
  reason: 'overtime_confirmation_required';
}>;

type ProductionForecastShiftPlanningActionability = Readonly<{
  action: 'plan_shift';
  state: 'available';
  reason: 'no_active_run' | 'ambiguous_active_run' | 'placement_rejected';
}>;

export type ProductionForecastOrderIdentity = Readonly<{
  orderDemandId: string;
  externalOrderId: string;
  dueAt: Date;
  priority: boolean;
  estimatedWeightLbs: number | null;
  bagCount: number | null;
}>;

export type ProductionForecastInProductionItem =
  ProductionForecastOrderIdentity &
    Readonly<{
      productionOrderId: string;
      activeRunId: string;
      activeBatchId: string;
      actionability: ProductionForecastOpenActionability;
    }>;

export type ProductionForecastReadyToPlaceItem =
  ProductionForecastOrderIdentity &
    Readonly<{
      productionOrderId: string;
      activeRunId: string;
      actionability: ProductionForecastPlacementActionability;
    }>;

export type ProductionForecastExpectedLaterItem =
  ProductionForecastOrderIdentity &
    Readonly<{
      productionOrderId: string | null;
      readiness: 'awaiting_release' | 'awaiting_intake' | 'not_admitted';
      actionability:
        | ProductionForecastMonitorActionability
        | ProductionForecastIntakeActionability
        | ProductionForecastReleaseActionability;
    }>;

export type ProductionForecastNeedsShiftReason =
  | 'no_active_run'
  | 'ambiguous_active_run'
  | 'placement_rejected'
  | 'current_run_window_exceeded';

export type ProductionForecastNeedsShiftItem = ProductionForecastOrderIdentity &
  Readonly<{
    productionOrderId: string;
    activeRunId: string | null;
    reason: ProductionForecastNeedsShiftReason;
    actionability:
      | ProductionForecastPlacementReviewActionability
      | ProductionForecastShiftPlanningActionability;
  }>;

export type ProductionForecastItem =
  | ProductionForecastInProductionItem
  | ProductionForecastReadyToPlaceItem
  | ProductionForecastExpectedLaterItem
  | ProductionForecastNeedsShiftItem;

export type ProductionForecastGroupSummary = Readonly<{
  orderCount: number;
  knownWeightLbs: number;
  missingEstimateOrderCount: number;
}>;

export type ProductionForecastCapacityReason =
  | 'all_ready_work_appendable'
  | 'needs_shift'
  | 'expected_later'
  | 'missing_estimates'
  | 'no_active_run'
  | 'ambiguous_active_run'
  | 'no_ready_work';

export type ProductionRemainingDayForecast = Readonly<{
  locationId: string;
  serviceDay: string;
  timezone: string;
  window: Readonly<{
    startsAt: Date;
    endsAt: Date;
  }>;
  asOf: Date;
  assumptions: Readonly<{
    algorithmVersion: 'online-stable-insertion-v1';
    overdueUnfinishedIncluded: true;
    physicalIntakeRequired: true;
    wholeOrderPlacement: true;
    expectedWeightsAdvisory: true;
    missingEstimatesExcludedFromWeightTotals: true;
    placementRevalidatedOnCommit: true;
    preciseFinishForecasted: false;
  }>;
  shifts: readonly Readonly<{
    productionShiftId: string;
    startsAt: Date;
    endsAt: Date;
    status: 'draft' | 'open' | 'closed';
    activeRunId: string | null;
  }>[];
  totals: Readonly<{
    all: ProductionForecastGroupSummary;
    inProduction: ProductionForecastGroupSummary;
    readyToPlace: ProductionForecastGroupSummary;
    expectedLater: ProductionForecastGroupSummary;
    needsShift: ProductionForecastGroupSummary;
  }>;
  capacityRisk: Readonly<{
    level: 'clear' | 'attention' | 'unknown';
    reasons: readonly ProductionForecastCapacityReason[];
    pulseCapacityLbs: number | null;
  }>;
  groups: Readonly<{
    inProduction: readonly ProductionForecastInProductionItem[];
    readyToPlace: readonly ProductionForecastReadyToPlaceItem[];
    expectedLater: readonly ProductionForecastExpectedLaterItem[];
    needsShift: readonly ProductionForecastNeedsShiftItem[];
  }>;
}>;
