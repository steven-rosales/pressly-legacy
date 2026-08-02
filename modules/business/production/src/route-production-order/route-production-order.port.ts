import type {
  CommitProductionOrderRouteRequest,
  CommitProductionOrderRouteResult,
  PreviewProductionOrderRouteRequest,
  ProductionOrderRouteProposal,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  WorkEventCommandIdentity,
} from '../command-execution/production-command.port.ts';
import type { OrderRoutingStage } from '../production-policy/order-routing-policy.port.ts';
import type {
  ProductionOrderExecutionState,
  ProductionOrderStageAttemptMutation,
} from '../production-lifecycle/production-lifecycle.model.ts';
import type { Transactional } from '../persistence/production-transaction.port.ts';

export type ProductionOrderRoutingActor = Readonly<{
  actorId: string;
  authorizedAction: 'production:stage';
}>;

export type PreviewProductionOrderRouteCommand =
  PreviewProductionOrderRouteRequest &
    Readonly<{
      locationId: string;
      productionRunId: string;
      productionOrderId: string;
    }> &
    ProductionOrderRoutingActor;

export type CommitProductionOrderRouteCommand =
  CommitProductionOrderRouteRequest &
    Readonly<{
      locationId: string;
      productionRunId: string;
      productionOrderId: string;
    }> &
    ProductionOrderRoutingActor;

export type PreviewProductionOrderRoute = (
  command: PreviewProductionOrderRouteCommand,
) => Promise<Result<ProductionOrderRouteProposal, AppError>>;

export type CommitProductionOrderRoute = (
  command: CommitProductionOrderRouteCommand,
) => Promise<Result<CommitProductionOrderRouteResult, AppError>>;

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
  reason: CommitProductionOrderRouteRequest['reason'];
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
  Transactional<RouteProductionOrderOperations>;
