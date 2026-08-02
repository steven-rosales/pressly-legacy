export type ProductionShiftLifecycleDecision = Readonly<{
  from: 'open' | 'closed';
  state: 'open' | 'closed';
}>;

export type ScheduleRevisionLifecycleDecision = Readonly<{
  from: 'draft' | 'accepted' | 'superseded' | 'rejected';
  state: 'draft' | 'accepted' | 'superseded' | 'rejected';
}>;

export type ScheduleSupersessionDecision = Readonly<{
  scheduleRunId: string;
  lifecycle: ScheduleRevisionLifecycleDecision;
}>;

export type ProductionRunLifecycleDecision = Readonly<{
  from: 'started' | 'completed';
  state: 'started' | 'completed';
}>;

export type ProductionBatchLifecycleState =
  | 'queued'
  | 'sorting'
  | 'washing'
  | 'drying'
  | 'folding_packaging'
  | 'finished';

export type ProductionBatchLifecycleDecision = Readonly<{
  from: ProductionBatchLifecycleState;
  state: ProductionBatchLifecycleState;
}>;

export type ProductionOrderExecutionState =
  | 'unassigned'
  | 'scheduled'
  | 'finished';

export type ProductionOrderExecutionLifecycleDecision = Readonly<{
  from: ProductionOrderExecutionState;
  state: ProductionOrderExecutionState;
}>;

export type ProductionOrderResolutionState =
  | 'open'
  | 'resolved_without_production';

export type ProductionOrderResolutionLifecycleDecision = Readonly<{
  from: ProductionOrderResolutionState;
  state: ProductionOrderResolutionState;
}>;

export type ProductionOrderResolutionReviewReason =
  | 'intake_recorded'
  | 'manual_admission'
  | 'priority'
  | 'pending_placement';

export type ProductionOrderResolutionBlockReason =
  | 'execution_committed'
  | 'selected_for_shift'
  | 'batch_membership_exists'
  | 'stage_attempt_exists'
  | 'route_exists';

export type ProductionOrderResolutionGuardDecision =
  | Readonly<{
      status: 'allowed';
      requiresExplicitReview: boolean;
      reviewReasons: readonly ProductionOrderResolutionReviewReason[];
      mayClearPendingPlacement: boolean;
    }>
  | Readonly<{
      status: 'blocked';
      blockReasons: readonly ProductionOrderResolutionBlockReason[];
    }>;

export type ProductionOrderSchedulingMutation = Readonly<{
  productionOrderId: string;
  persistedState: ProductionOrderExecutionState;
  expectedVersion: number;
  lifecycle: Readonly<{
    from: 'unassigned';
    state: 'scheduled';
  }>;
}>;

export type ProductionOrderTerminalExecutionMutation = Readonly<{
  productionOrderId: string;
  persistedState: ProductionOrderExecutionState;
  expectedVersion: number;
  lifecycle: Readonly<{
    from: 'scheduled';
    state: 'finished';
  }>;
}>;

export type ProductionOrderStageAttemptState =
  | 'assigned'
  | 'completed'
  | 'released';

export type ProductionOrderStageAttemptLifecycleDecision = Readonly<{
  from: ProductionOrderStageAttemptState;
  state: ProductionOrderStageAttemptState;
}>;

export type ProductionOrderStageAttemptMutation = Readonly<{
  attemptId: string;
  stageRunId: string;
  lifecycle: ProductionOrderStageAttemptLifecycleDecision;
}>;

export type ProductionTerminalLifecycleDecisions = Readonly<{
  run: ProductionRunLifecycleDecision;
  shift: ProductionShiftLifecycleDecision;
  orders: readonly ProductionOrderTerminalExecutionMutation[];
}>;
