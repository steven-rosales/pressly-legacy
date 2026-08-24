import type {
  OnlinePlacementProposal,
  ProductionPlacementFailureReason,
  ProductionPlacementMode,
  ProductionPlacementPreview,
  ProductionPlacementTarget,
} from '../../../model/online-order-placement/model.ts';
import type {
  ProductionOrderSchedulingMutation,
  ProductionRules,
} from '../../../model/public.ts';

export type ConfirmProductionOrderOvertimeCommand = Readonly<{
  locationId: string;
  productionRunId: string;
  productionOrderId: string;
  expectedQueueVersion: number;
  proposalHash: string;
  idempotencyKey: string;
  actorId: string;
  authorizedAction: 'production:override';
}>;

export type StoredOvertimeProposal = Readonly<{
  mode: ProductionPlacementMode;
  targetBatchId: string | null;
  proposalHash: string;
  queueVersion: number;
}>;

export type ConfirmedProductionOrderPlacedResult = Readonly<{
  status: 'placed';
  mode: ProductionPlacementMode;
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

export type ConfirmedProductionOrderNotPlacedResult = Readonly<{
  status: 'not_placed';
  mode: ProductionPlacementMode;
  productionRunId: string;
  productionOrderId: string;
  reason: ProductionPlacementFailureReason;
  message: string;
  queueVersion: number;
  replayed: boolean;
}>;

export type ConfirmProductionOrderOvertimeResult =
  | ConfirmedProductionOrderNotPlacedResult
  | ConfirmedProductionOrderPlacedResult;

export type ConfirmedPlacementConfirmationRequiredResult = Readonly<{
  status: 'confirmation_required';
  mode: ProductionPlacementMode;
  productionRunId: string;
  productionOrderId: string;
  target: ProductionPlacementTarget;
  affectedBatchIds: readonly string[];
  queueVersion: number;
  proposalHash: string;
  projectedCompletionAt: string;
  overtimeMinutes: number;
  replayed: boolean;
}>;

export type ConfirmOrderOvertimeTransactionResult =
  | ConfirmProductionOrderOvertimeResult
  | ConfirmedPlacementConfirmationRequiredResult;

export type ConfirmOrderOvertimePendingPlacement =
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

export type ConfirmOrderOvertimeFailureCode =
  | 'production_idempotency_conflict'
  | 'production_order_execution_event_not_allowed'
  | 'production_order_execution_state_invalid'
  | 'production_order_execution_transition_invalid'
  | 'production_placement_context_not_found'
  | 'production_placement_order_version_conflict'
  | 'production_placement_queue_version_conflict'
  | 'production_placement_stage_version_conflict';

export type ConfirmOrderOvertimeExpectedFailure = Readonly<{
  kind: 'conflict' | 'not_found';
  code: ConfirmOrderOvertimeFailureCode;
  message: string;
  safeMessage: string;
}>;

export type ConfirmOrderOvertimePolicy = Pick<
  ProductionRules,
  | 'evaluatePlacementCommit'
  | 'evaluateProductionOrderExecutionTransition'
  | 'initialProductionBatchState'
  | 'initialProductionOrderStageAttemptState'
  | 'initialProductionStageState'
  | 'resolveProductionOrderExecutionState'
>;

export type ConfirmOrderOvertimeDecision =
  | Readonly<{
      kind: 'commit';
      proposal: OnlinePlacementProposal;
      orderLifecycle: ProductionOrderSchedulingMutation;
    }>
  | Readonly<{
      kind: 'record';
      result:
        | ConfirmedPlacementConfirmationRequiredResult
        | ConfirmedProductionOrderNotPlacedResult;
      proposal: OnlinePlacementProposal | null;
    }>
  | Readonly<{
      kind: 'reject';
      failure: ConfirmOrderOvertimeExpectedFailure;
    }>;
