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

export type ProductionOrderResolutionDenialReason =
  | 'execution_state_invalid'
  | 'execution_finished'
  | 'resolution_transition_invalid'
  | 'execution_committed'
  | 'selected_for_shift'
  | 'batch_membership_exists'
  | 'stage_attempt_exists'
  | 'route_exists';

export type ProductionOrderResolutionAvailability =
  | Readonly<{
      status: 'allowed';
      expectedVersion: number;
      requiresExplicitReview: boolean;
      reviewReasons: readonly ProductionOrderResolutionReviewReason[];
    }>
  | Readonly<{
      status: 'blocked';
      reasons: readonly ProductionOrderResolutionDenialReason[];
    }>;

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

export type ProductionFloorMilestone =
  | 'waiting_to_sort'
  | 'sorting_started'
  | 'sorting_completed'
  | 'washing_started'
  | 'washing_completed'
  | 'drying_started'
  | 'drying_completed'
  | 'folding_packaging_started'
  | 'finished';

export type ProductionFloorProgressTarget = Exclude<
  ProductionFloorMilestone,
  'waiting_to_sort'
>;

export type ProductionStageStartTiming = Readonly<{
  plannedStartAt: string;
  plannedEndAt: string;
  observedAt: string;
  remainingMilliseconds: number;
}>;

export type ProductionStageCompletionTiming = Readonly<{
  actualStartAt: string;
  plannedEndAt: string;
  completionBoundaryAt: string;
  observedAt: string;
  plannedDurationMilliseconds: number;
  elapsedMilliseconds: number;
  remainingMilliseconds: number;
}>;

export type ProductionStageActionBlockCode =
  | 'PRODUCTION_RUN_NOT_STARTED'
  | 'PREVIOUS_STAGE_INCOMPLETE'
  | 'STAGE_KIND_ALREADY_ACTIVE'
  | 'MACHINE_ASSIGNMENT_REQUIRED'
  | 'MACHINE_ASSIGNMENT_OVERLAPS';

export type ProductionStageNextAction =
  | Readonly<{ state: 'available'; action: 'start' | 'complete' }>
  | Readonly<{
      state: 'blocked';
      action: 'start' | 'complete';
      code: ProductionStageActionBlockCode;
      message: string;
      availableAt: string | null;
    }>
  | Readonly<{
      state: 'confirmation_required';
      action: 'start';
      code: 'PLANNED_START_NOT_REACHED';
      message: string;
      availableAt: string;
      timing: ProductionStageStartTiming;
    }>
  | Readonly<{
      state: 'confirmation_required';
      action: 'complete';
      code: 'PULSE_BOUNDARY_NOT_REACHED';
      message: string;
      availableAt: string;
      timing: ProductionStageCompletionTiming;
    }>
  | Readonly<{ state: 'terminal'; reason: 'stage_completed' }>;

export type ProductionOrderRouteReason =
  | 'manual_rebatch'
  | 'needs_more_drying'
  | 'rewash_required'
  | 'sorting_incomplete'
  | 'stage_incomplete'
  | 'other';
