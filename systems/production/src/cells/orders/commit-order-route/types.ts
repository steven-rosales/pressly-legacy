import type { ProductionOrderStageAttemptMutation } from '../../../model/execution.ts';
import type {
  OrderRouteProposalCommand,
  OrderRouteProposalContext,
  OrderRouteProposalConflictFailure,
  OrderRouteProposalFailure,
  OrderRouteProposalPolicy,
  ProductionOrderRouteProposal,
} from '../../../model/order-route-proposal/model.ts';
import type { ProductionRules } from '../../../model/rules.ts';

export const commitOrderRouteOperationId =
  'production.commit-order-route.v1' as const;

export type CommitOrderRouteCommand = OrderRouteProposalCommand &
  Readonly<{
    proposalHash: string;
    idempotencyKey: string;
  }>;

export type CommitOrderRouteResult = Readonly<{
  status: 'routed';
  proposal: ProductionOrderRouteProposal;
  queueVersion: number;
  orderVersion: number;
  sourceBatchVersion: number;
  targetBatchVersion: number;
  createdAttemptIds: readonly string[];
  replayed: boolean;
}>;

export type CommitOrderRouteNotFoundFailure = Readonly<{
  kind: 'not_found';
  code: 'production_order_route_not_found';
  message: 'The production run, order, or current batch was not found.';
  safeMessage: 'The production run, order, or current batch was not found.';
}>;

export type CommitOrderRouteIdempotencyConflictFailure = Readonly<{
  kind: 'conflict';
  code: 'production_idempotency_conflict';
  message: 'The idempotency key belongs to a different production command.';
  safeMessage: 'The idempotency key belongs to a different production command.';
}>;

export type CommitOrderRouteExpectedFailure =
  | CommitOrderRouteNotFoundFailure
  | CommitOrderRouteIdempotencyConflictFailure
  | OrderRouteProposalFailure;

export type CommitOrderRoutePolicy = OrderRouteProposalPolicy &
  Pick<
    ProductionRules,
    | 'evaluateProductionOrderStageAttemptTransition'
    | 'initialProductionOrderStageAttemptState'
  >;

export type CommitOrderRoutePlan = Readonly<{
  proposal: ProductionOrderRouteProposal;
  attemptLifecycles: readonly ProductionOrderStageAttemptMutation[];
  initialAttemptState: 'assigned';
}>;

export type CommitOrderRouteDecision =
  | Readonly<{ kind: 'commit'; plan: CommitOrderRoutePlan }>
  | Readonly<{ kind: 'reject'; failure: OrderRouteProposalFailure }>;

export type CommitOrderRouteMutationInput = Readonly<{
  locationId: string;
  actorId: string;
  reason: CommitOrderRouteCommand['reason'];
  note?: string;
  idempotencyKey: string;
  context: OrderRouteProposalContext;
  plan: CommitOrderRoutePlan;
  now: Date;
}>;

export type CommitOrderRouteMutation =
  | Readonly<{ kind: 'saved'; result: CommitOrderRouteResult }>
  | Readonly<{
      kind: 'conflict';
      failure: OrderRouteProposalConflictFailure;
    }>;
