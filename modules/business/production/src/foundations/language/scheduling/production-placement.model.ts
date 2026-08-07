/**
 * Placement outcomes are persisted in the work-event idempotency envelope and
 * replayed as JSON. Timestamps therefore remain canonical ISO strings until a
 * persistence replay codec can rehydrate them into Dates.
 */
export type ProductionPlacementMode = 'automatic' | 'manager_exact';

export type ProductionPlacementTarget =
  | Readonly<{
      kind: 'existing_batch';
      productionBatchId: string;
      sequence: number;
    }>
  | Readonly<{
      kind: 'new_batch';
      sequence: number;
    }>;

export type ProductionPlacementFailureReason =
  | 'hard_capacity_exceeded'
  | 'run_not_started'
  | 'run_completed'
  | 'order_not_eligible'
  | 'order_already_scheduled'
  | 'no_mutable_position'
  | 'queue_conflict'
  | 'proposal_stale';

export type ProductionPlacementPreview = Readonly<{
  target: ProductionPlacementTarget;
  affectedBatchIds: readonly string[];
  queueVersion: number;
  proposalHash: string;
  projectedCompletionAt: string;
  overtimeMinutes: number;
}>;

export type ProductionPendingPlacement =
  | Readonly<{
      status: 'awaiting_run';
      reason: 'no_started_run' | 'automatic_placement_not_attempted';
      message: string;
    }>
  | Readonly<{
      status: 'ambiguous_run';
      reason: 'multiple_started_runs';
      message: string;
      candidateProductionRunIds: readonly string[];
    }>
  | Readonly<{
      status: 'confirmation_required';
      mode: ProductionPlacementMode;
      productionRunId: string;
      target: ProductionPlacementTarget;
      affectedBatchIds: readonly string[];
      queueVersion: number;
      proposalHash: string;
      projectedCompletionAt: string;
      overtimeMinutes: number;
    }>
  | Readonly<{
      status: 'not_placed';
      mode: ProductionPlacementMode;
      productionRunId: string;
      reason: ProductionPlacementFailureReason;
      message: string;
      queueVersion: number;
      preview: ProductionPlacementPreview | null;
    }>;

export type ProductionPendingOrder = Readonly<{
  id: string;
  externalOrderId: string;
  dueAt: string;
  dueBucket: 'overdue' | 'today' | 'tomorrow' | 'later';
  priority: boolean;
  derivedWeightLbs: number;
  bagCount: number;
  version: number;
  placement: ProductionPendingPlacement;
}>;

export type ProductionOrderPlacedResult<
  Mode extends ProductionPlacementMode = ProductionPlacementMode,
> = Readonly<{
  status: 'placed';
  mode: Mode;
  productionRunId: string;
  productionOrderId: string;
  productionBatchId: string;
  createdBatch: boolean;
  affectedBatchIds: readonly string[];
  queueVersion: number;
  proposalHash: string;
  plannedCompletionAt: string;
  overtimeMinutes: number;
  replayed: boolean;
}>;

export type ProductionOrderPlacementConfirmationRequiredResult<
  Mode extends ProductionPlacementMode = ProductionPlacementMode,
> = Readonly<{
  status: 'confirmation_required';
  mode: Mode;
  productionRunId: string;
  productionOrderId: string;
  target: ProductionPlacementTarget;
  affectedBatchIds: readonly string[];
  queueVersion: number;
  proposalHash: string;
  projectedCompletionAt: string;
  overtimeMinutes: number;
  replayed: false;
}>;

export type ProductionOrderNotPlacedResult<
  Mode extends ProductionPlacementMode = ProductionPlacementMode,
> = Readonly<{
  status: 'not_placed';
  mode: Mode;
  productionRunId: string;
  productionOrderId: string;
  reason: ProductionPlacementFailureReason;
  message: string;
  queueVersion: number;
  replayed: boolean;
}>;

type ProductionOrderPlacementResultFor<Mode extends ProductionPlacementMode> =
  | ProductionOrderPlacedResult<Mode>
  | ProductionOrderPlacementConfirmationRequiredResult<Mode>
  | ProductionOrderNotPlacedResult<Mode>;

export type AutomaticProductionOrderPlacementResult =
  ProductionOrderPlacementResultFor<'automatic'>;

export type ExactProductionOrderPlacementResult =
  ProductionOrderPlacementResultFor<'manager_exact'>;

export type ProductionOrderPlacementResult =
  | AutomaticProductionOrderPlacementResult
  | ExactProductionOrderPlacementResult;

export type ConfirmProductionOrderOvertimeResult = Extract<
  ProductionOrderPlacementResult,
  { status: 'placed' | 'not_placed' }
>;
