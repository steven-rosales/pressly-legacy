import type {
  OnlinePlacementProposal,
  ProductionPlacementFailureReason,
  ProductionPlacementPreview,
  ProductionPlacementTarget,
} from '../../../model/online-order-placement/model.ts';
import type {
  ProductionOrderSchedulingMutation,
  ProductionRules,
} from '../../../model/public.ts';

/**
 * Automatic placement is also used by the headless run-discovery command.
 * Its internal caller may hold `production:queue`; the HTTP cell narrows the
 * same command to the deployed `production:override` route authority.
 */
export type AutomaticPlacementCommand = Readonly<{
  locationId: string;
  productionRunId: string;
  productionOrderId: string;
  expectedQueueVersion: number;
  idempotencyKey: string;
  actorId: string;
  authorizedAction: 'production:queue' | 'production:override';
}>;

export type PlaceProductionOrderAutomaticallyCommand =
  AutomaticPlacementCommand &
    Readonly<{ authorizedAction: 'production:override' }>;

export type AutomaticProductionOrderPlacedResult = Readonly<{
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
}>;

/**
 * The legacy replay helper marks every stored result as replayed, including a
 * confirmation-required result whose current wire schema accepts only false.
 * The wider boolean deliberately preserves that deployed executor quirk.
 */
export type AutomaticProductionOrderPlacementConfirmationRequiredResult =
  Readonly<{
    status: 'confirmation_required';
    mode: 'automatic';
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

export type AutomaticProductionOrderNotPlacedResult = Readonly<{
  status: 'not_placed';
  mode: 'automatic';
  productionRunId: string;
  productionOrderId: string;
  reason: ProductionPlacementFailureReason;
  message: string;
  queueVersion: number;
  replayed: boolean;
}>;

export type AutomaticProductionOrderPlacementResult =
  | AutomaticProductionOrderPlacedResult
  | AutomaticProductionOrderPlacementConfirmationRequiredResult
  | AutomaticProductionOrderNotPlacedResult;

export type AutomaticProductionPendingPlacement =
  | Readonly<{
      status: 'confirmation_required';
      mode: 'automatic';
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
      mode: 'automatic';
      productionRunId: string;
      reason: ProductionPlacementFailureReason;
      message: string;
      queueVersion: number;
      preview: ProductionPlacementPreview | null;
    }>;

export type PlaceOrderAutomaticallyFailureCode =
  | 'production_idempotency_conflict'
  | 'production_order_execution_event_not_allowed'
  | 'production_order_execution_state_invalid'
  | 'production_order_execution_transition_invalid'
  | 'production_placement_context_not_found'
  | 'production_placement_order_version_conflict'
  | 'production_placement_queue_version_conflict'
  | 'production_placement_stage_version_conflict';

export type PlaceOrderAutomaticallyExpectedFailure = Readonly<{
  kind: 'conflict' | 'not_found';
  code: PlaceOrderAutomaticallyFailureCode;
  message: string;
  safeMessage: string;
}>;

export type PlaceOrderAutomaticallyPolicy = Pick<
  ProductionRules,
  | 'evaluatePlacementCommit'
  | 'evaluateProductionOrderExecutionTransition'
  | 'initialProductionBatchState'
  | 'initialProductionOrderStageAttemptState'
  | 'initialProductionStageState'
  | 'resolveProductionOrderExecutionState'
>;

export type PlaceOrderAutomaticallyDecision =
  | Readonly<{
      kind: 'commit';
      proposal: OnlinePlacementProposal;
      orderLifecycle: ProductionOrderSchedulingMutation;
    }>
  | Readonly<{
      kind: 'record';
      result:
        | AutomaticProductionOrderNotPlacedResult
        | AutomaticProductionOrderPlacementConfirmationRequiredResult;
      proposal: OnlinePlacementProposal | null;
    }>
  | Readonly<{
      kind: 'reject';
      failure: PlaceOrderAutomaticallyExpectedFailure;
    }>;
