import type { RouteProductionOrderFailure } from './route-production-order.failure.ts';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  WorkEventCommandIdentity,
} from '../../../foundations/language/commands/production-command.model.ts';
import type { OrderRoutingStage } from '../../../foundations/language/order-routing/order-routing.policy.ts';
import type {
  ProductionOrderExecutionState,
  ProductionOrderRouteReason,
  ProductionOrderStageAttemptMutation,
} from '../../../foundations/language/execution/production-lifecycle.model.ts';
import type { UnitOfWork } from '@pressly/kernel';
import type {
  CommitProductionOrderRouteCommand,
  CommitProductionOrderRouteResult,
  PreviewProductionOrderRouteCommand,
  ProductionOrderRouteProposal,
} from './route-production-order.model.ts';

export type PreviewProductionOrderRoute = (
  command: PreviewProductionOrderRouteCommand,
) => Promise<Result<ProductionOrderRouteProposal, RouteProductionOrderFailure>>;

export type CommitProductionOrderRoute = (
  command: CommitProductionOrderRouteCommand,
) => Promise<
  Result<CommitProductionOrderRouteResult, RouteProductionOrderFailure>
>;

export type ProductionOrderRoutingContext = Readonly<{
  run: Readonly<{
    id: string;
    status: string;
    queueVersion: number;
  }>;
  order: Readonly<{
    id: string;
    operationalStatus: string;
    executionStatus: string;
    resolutionState: string;
    version: number;
    weightLbs: number;
  }>;
  source: Readonly<{
    membershipId: string;
    productionBatchId: string;
    sequence: number;
    status: string;
    membershipFrozen: boolean;
    version: number;
    derivedWeightLbs: number;
    activeOrderCount: number;
  }>;
  candidates: readonly Readonly<{
    productionBatchId: string;
    sequence: number;
    status: string;
    membershipFrozen: boolean;
    version: number;
    derivedWeightLbs: number;
    pulseCapacityLbs: number;
    stages: readonly Readonly<{
      stageRunId: string;
      stage: OrderRoutingStage;
      status: 'planned' | 'started' | 'completed';
      assignedWeightLbs: number;
      capacityLbs: number;
    }>[];
  }>[];
  attempts: readonly Readonly<{
    id: string;
    stageRunId: string;
    productionBatchId: string;
    stage: OrderRoutingStage;
    attemptNumber: number;
    status: 'assigned' | 'completed' | 'released';
  }>[];
}>;

export type CommitProductionOrderRouteInput = Readonly<{
  locationId: string;
  actorId: string;
  reason: ProductionOrderRouteReason;
  note?: string | undefined;
  idempotencyKey: string;
  idempotency: WorkEventCommandIdentity;
  context: ProductionOrderRoutingContext;
  proposal: ProductionOrderRouteProposal;
  orderExecutionState: ProductionOrderExecutionState;
  attemptLifecycles: readonly ProductionOrderStageAttemptMutation[];
  initialAttemptState: 'assigned';
  now: Date;
}>;

export type RouteProductionOrderOperations = Readonly<{
  findWorkEvent: FindWorkEvent;
  loadContext: (
    locationId: string,
    productionRunId: string,
    productionOrderId: string,
    lock: boolean,
  ) => Promise<ProductionOrderRoutingContext | null>;
  commit: (
    input: CommitProductionOrderRouteInput,
  ) => Promise<CommitProductionOrderRouteResult>;
}>;

export type RouteProductionOrderRepository =
  UnitOfWork<RouteProductionOrderOperations>;
