import type { ProductionOrderSchedulingMutation } from '../../../model/execution.ts';
import type {
  OnlinePlacementProposal,
  ProductionOrderPlacementContext,
  ProductionPlacementFailureReason,
  ProductionPlacementTarget,
} from '../../../model/online-order-placement/model.ts';
import type { ProductionRules } from '../../../model/rules.ts';

export const placeOrderExactlyOperationId =
  'production.place-order-exactly.v1' as const;

export type PlaceOrderExactlyCommand = Readonly<{
  locationId: string;
  productionRunId: string;
  productionBatchId: string;
  productionOrderId: string;
  expectedQueueVersion: number;
  expectedBatchVersion: number;
  idempotencyKey: string;
  actorId: string;
  authorizedAction: 'production:override';
}>;

export type ExactOrderPlacedResult = Readonly<{
  status: 'placed';
  mode: 'manager_exact';
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

export type ExactOrderPlacementConfirmationRequiredResult = Readonly<{
  status: 'confirmation_required';
  mode: 'manager_exact';
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

export type ExactOrderNotPlacedResult = Readonly<{
  status: 'not_placed';
  mode: 'manager_exact';
  productionRunId: string;
  productionOrderId: string;
  reason: ProductionPlacementFailureReason;
  message: string;
  queueVersion: number;
  replayed: boolean;
}>;

export type PlaceOrderExactlyResult =
  | ExactOrderPlacedResult
  | ExactOrderPlacementConfirmationRequiredResult
  | ExactOrderNotPlacedResult;

export type PlaceOrderExactlyNotFoundFailure = Readonly<{
  kind: 'not_found';
  code: 'production_placement_context_not_found';
  message: 'The production run or order was not found.';
  safeMessage: 'The production run or order was not found.';
}>;

export type PlaceOrderExactlyConflictFailure = Readonly<{
  kind: 'conflict';
  code: string;
  message: string;
  safeMessage: string;
}>;

export type PlaceOrderExactlyExpectedFailure =
  | PlaceOrderExactlyNotFoundFailure
  | PlaceOrderExactlyConflictFailure;

export type PlaceOrderExactlyPolicy = Pick<
  ProductionRules,
  | 'evaluatePlacementCommit'
  | 'resolveProductionOrderExecutionState'
  | 'evaluateProductionOrderExecutionTransition'
  | 'initialProductionBatchState'
  | 'initialProductionStageState'
  | 'initialProductionOrderStageAttemptState'
>;

export type PlaceOrderExactlyCommitPlan = Readonly<{
  proposal: OnlinePlacementProposal;
  orderLifecycle: ProductionOrderSchedulingMutation;
  initialBatchState: 'queued';
  initialStageState: 'planned';
  initialAttemptState: 'assigned';
}>;

export type PlaceOrderExactlyDecision =
  | Readonly<{
      kind: 'audit';
      result:
        | ExactOrderNotPlacedResult
        | ExactOrderPlacementConfirmationRequiredResult;
      proposal: OnlinePlacementProposal | null;
    }>
  | Readonly<{ kind: 'commit'; plan: PlaceOrderExactlyCommitPlan }>
  | Readonly<{
      kind: 'reject';
      failure: PlaceOrderExactlyConflictFailure;
    }>;

export type PlaceOrderExactlyMutationInput = Readonly<{
  command: PlaceOrderExactlyCommand;
  context: ProductionOrderPlacementContext;
  plan: PlaceOrderExactlyCommitPlan;
  now: Date;
}>;

export type PlaceOrderExactlyMutation =
  | Readonly<{ kind: 'saved'; result: ExactOrderPlacedResult }>
  | Readonly<{
      kind: 'conflict';
      failure: PlaceOrderExactlyConflictFailure;
    }>;
