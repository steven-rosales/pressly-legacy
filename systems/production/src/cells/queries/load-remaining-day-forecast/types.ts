import type { ProductionRules } from '../../../model/public.ts';

export const loadRemainingDayForecastOperationId =
  'production.load-remaining-day-forecast.v1' as const;
export const remainingDayForecastRowLimit = 500;

export type LoadRemainingDayForecastInput = Readonly<{
  locationId: string;
  serviceDay: string;
}>;

export type ServiceDayWindow = Readonly<{
  startsAt: Date;
  endsAt: Date;
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

export type RemainingDayPlacementStage = Readonly<{
  stage: 'sorting' | 'washing' | 'drying' | 'folding_packaging';
  startsAt: string;
  endsAt: string;
  machineIds: readonly string[];
}>;

export type RemainingDayPlacementBatch = Readonly<{
  id: string;
  sequence: number;
  status:
    | 'queued'
    | 'sorting'
    | 'washing'
    | 'drying'
    | 'folding_packaging'
    | 'finished';
  membershipFrozen: boolean;
  orderIds: readonly string[];
  priorityOrderIds: readonly string[];
  derivedWeightLbs: number;
  bagCount: number;
  stages: readonly RemainingDayPlacementStage[];
}>;

export type RemainingDayActiveRun = Readonly<{
  run: Readonly<{
    id: string;
    queueVersion: number;
    startsAt: string;
    shiftEndsAt: string;
    pulseMinutes: number;
    pulseCapacityLbs: number;
  }>;
  machines: readonly Readonly<{
    id: string;
    stationKind: 'washing' | 'drying';
    effectiveCapacityLbs: number;
    active: boolean;
  }>[];
  batches: readonly RemainingDayPlacementBatch[];
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
  activeRuns: readonly RemainingDayActiveRun[];
}>;

export type LoadRemainingDayForecastRepositoryResult =
  | RemainingDayForecastReadModel
  | 'scope_too_large'
  | 'invalid_service_day'
  | null;

export type LoadRemainingDayForecastRepository = Readonly<{
  load: (input: {
    locationId: string;
    serviceDay: string;
    asOf: Date;
    rowLimit: number;
  }) => Promise<LoadRemainingDayForecastRepositoryResult>;
}>;

export type OnlinePlacementInput = Readonly<{
  order: Readonly<{
    id: string;
    priority: boolean;
    derivedWeightLbs: number;
    bagCount: number;
    version: number;
  }>;
  run: RemainingDayActiveRun['run'];
  machines: RemainingDayActiveRun['machines'];
  batches: RemainingDayActiveRun['batches'];
  mode: Readonly<{ type: 'automatic' }>;
}>;

export type OnlinePlacementResult =
  | Readonly<{ kind: 'rejected' }>
  | Readonly<{
      kind: 'proposed';
      affectedFromSequence: number;
      affectedBatches: readonly Readonly<{
        sourceBatchId: string | null;
        sequence: number;
        status: RemainingDayPlacementBatch['status'];
        membershipFrozen: boolean;
        orderIds: readonly string[];
        priorityOrderIds: readonly string[];
        derivedWeightLbs: number;
        bagCount: number;
        stages: readonly RemainingDayPlacementStage[];
      }>[];
      overtime: Readonly<{ required: boolean }>;
    }>;

export type RemainingDayForecastScheduler = Readonly<{
  proposeOnlinePlacement: (
    input: OnlinePlacementInput,
  ) => OnlinePlacementResult;
}>;

export type RemainingDayForecastPolicy = Pick<
  ProductionRules,
  | 'resolveProductionOrderExecutionState'
  | 'deriveProductionOrderOperationalStatus'
>;

export type RemainingDayReadyOrder = Readonly<{
  id: string;
  dueAt: string;
  priority: boolean;
  derivedWeightLbs: number;
  bagCount: number;
  version: number;
}>;

export type RemainingDayForecastReason =
  | 'no_active_run'
  | 'ambiguous_active_run'
  | 'placement_rejected'
  | 'current_run_window_exceeded';

export type RemainingDayForecastDecision = Readonly<{
  productionOrderId: string;
  disposition: 'ready_to_place' | 'needs_shift';
  reason: RemainingDayForecastReason | null;
}>;

export type RemainingDayPlacementProjection = Readonly<{
  algorithmVersion: 'online-stable-insertion-v1';
  decisions: readonly RemainingDayForecastDecision[];
}>;

export type StoredSchedulingInput = Readonly<{
  orders: readonly Readonly<{
    id: string;
    externalOrderId: string;
    dueAt: string;
    priority: boolean;
    derivedWeightLbs: number;
    bagCount: number;
    version: number;
  }>[];
  machines: RemainingDayActiveRun['machines'];
  shift: Readonly<{
    id: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    effectiveFolderCount: number;
    version: number;
  }>;
  config: Readonly<{
    id: string;
    pulseMinutes: number;
    foldLbsPerFolderMinute: number;
    algorithmVersion: 'fixed-pulse-ffd-v2';
    version: number;
  }>;
}>;

export type StoredSchedulingOutput = Readonly<{
  algorithmVersion: 'fixed-pulse-ffd-v2';
  inputSnapshotHash: string;
  outputPlanHash: string;
  canonicalOutput: string;
  pulseMinutes: number;
  pulseCapacityLbs: number;
  batchCount: number;
  makespanMinutes: number;
  plannedCompletionAt: string;
  batches: readonly Readonly<{
    sequence: number;
    orderIds: readonly string[];
    derivedWeightLbs: number;
    bagCount: number;
    stages: readonly RemainingDayPlacementStage[];
  }>[];
  unplacedOrderIds: readonly string[];
  warnings: readonly unknown[];
}>;

export type LoadRemainingDayForecastLocationNotFound = Readonly<{
  tag: 'ProductionFailure';
  kind: 'not_found';
  code: 'production_location_not_found';
  message: 'The active production location was not found.';
  safeMessage: 'The active production location was not found.';
}>;

export type LoadRemainingDayForecastInvalidServiceDay = Readonly<{
  tag: 'ProductionFailure';
  kind: 'validation';
  classification: 'malformed';
  code: 'production_forecast_service_day_invalid';
  message: 'The requested service day is invalid for this location.';
  safeMessage: 'The requested service day is invalid for this location.';
}>;

export type LoadRemainingDayForecastScopeTooLarge = Readonly<{
  tag: 'ProductionFailure';
  kind: 'conflict';
  code: 'production_forecast_scope_too_large';
  message: 'The remaining-day forecast exceeds the supported work limit.';
  safeMessage: 'The remaining-day forecast exceeds the supported work limit.';
}>;

export type LoadRemainingDayForecastExecutionInvalid = Readonly<{
  tag: 'ProductionFailure';
  kind: 'conflict';
  code: 'production_order_execution_state_invalid';
  message: string;
  safeMessage: string;
}>;

export type LoadRemainingDayForecastExpectedFailure =
  | LoadRemainingDayForecastLocationNotFound
  | LoadRemainingDayForecastInvalidServiceDay
  | LoadRemainingDayForecastScopeTooLarge
  | LoadRemainingDayForecastExecutionInvalid;
