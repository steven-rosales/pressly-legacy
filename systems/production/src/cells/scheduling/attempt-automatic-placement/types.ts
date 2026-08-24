export const attemptAutomaticPlacementOperationId =
  'production.attempt-automatic-placement.v1' as const;

export type AttemptAutomaticPlacementCommand = Readonly<{
  locationId: string;
  productionOrderId: string;
  idempotencyKey: string;
  actorId: string;
  authorizedAction: 'production:queue' | 'production:override';
}>;

export type AutomaticPlacementDelegationCommand =
  AttemptAutomaticPlacementCommand &
    Readonly<{
      productionRunId: string;
      expectedQueueVersion: number;
    }>;

export type AutomaticPlacementTarget =
  | Readonly<{
      kind: 'existing_batch';
      productionBatchId: string;
      sequence: number;
    }>
  | Readonly<{ kind: 'new_batch'; sequence: number }>;

export type AutomaticPlacementFailureReason =
  | 'hard_capacity_exceeded'
  | 'run_not_started'
  | 'run_completed'
  | 'order_not_eligible'
  | 'order_already_scheduled'
  | 'no_mutable_position'
  | 'queue_conflict'
  | 'proposal_stale';

export type AttemptAutomaticPlacementValue =
  | Readonly<{
      status: 'placed';
      mode: 'automatic';
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
    }>
  | Readonly<{
      status: 'confirmation_required';
      mode: 'automatic';
      productionRunId: string;
      productionOrderId: string;
      target: AutomaticPlacementTarget;
      affectedBatchIds: readonly string[];
      queueVersion: number;
      proposalHash: string;
      projectedCompletionAt: string;
      overtimeMinutes: number;
      replayed: boolean;
    }>
  | Readonly<{
      status: 'not_placed';
      mode: 'automatic';
      productionRunId: string;
      productionOrderId: string;
      reason: AutomaticPlacementFailureReason;
      message: string;
      queueVersion: number;
      replayed: boolean;
    }>;

export type AttemptAutomaticPlacementResult =
  AttemptAutomaticPlacementValue | null;

export type AttemptAutomaticPlacementFailureCode =
  | 'production_idempotency_conflict'
  | 'production_order_execution_event_not_allowed'
  | 'production_order_execution_state_invalid'
  | 'production_order_execution_transition_invalid'
  | 'production_placement_context_not_found'
  | 'production_placement_order_version_conflict'
  | 'production_placement_queue_version_conflict'
  | 'production_placement_stage_version_conflict';

export type AttemptAutomaticPlacementExpectedFailure = Readonly<{
  kind: 'conflict' | 'not_found';
  code: AttemptAutomaticPlacementFailureCode;
  message: string;
  safeMessage: string;
}>;

export type StartedProductionRun = Readonly<{
  productionRunId: string;
  queueVersion: number;
}>;

export type PendingRunResolution =
  | Readonly<{
      status: 'awaiting_run';
      reason: 'no_started_run';
      message: string;
    }>
  | Readonly<{
      status: 'ambiguous_run';
      reason: 'multiple_started_runs';
      message: string;
      candidateProductionRunIds: readonly string[];
    }>;

export type AttemptAutomaticPlacementDecision =
  | Readonly<{
      kind: 'place';
      run: StartedProductionRun;
    }>
  | Readonly<{
      kind: 'record';
      placement: PendingRunResolution;
    }>;
