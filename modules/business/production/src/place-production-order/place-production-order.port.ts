import type {
  AutomaticProductionOrderPlacementResult,
  ConfirmProductionOrderOvertimeCommand,
  ConfirmProductionOrderOvertimeResult,
  ExactProductionOrderPlacementResult,
  PlaceProductionOrderAutomaticallyCommand,
  PlaceProductionOrderExactlyCommand,
  ProductionPendingPlacement,
  ProductionOrderPlacementResult,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  OnlinePlacementProposal,
  ProductionOrderPlacementContext,
  ProductionOrderSchedulingMutation,
  Transactional,
  WorkEventCommandIdentity,
} from '../production.port.ts';

export type PlacementActor = Readonly<{
  actorId: string;
  authorizedAction: 'production:queue' | 'production:override';
}>;

export type PlaceProductionOrderAutomatically = (
  command: PlaceProductionOrderAutomaticallyCommand & PlacementActor,
) => Promise<Result<AutomaticProductionOrderPlacementResult, AppError>>;

export type PlaceProductionOrderExactly = (
  command: PlaceProductionOrderExactlyCommand & PlacementActor,
) => Promise<Result<ExactProductionOrderPlacementResult, AppError>>;

export type ConfirmProductionOrderOvertime = (
  command: ConfirmProductionOrderOvertimeCommand & PlacementActor,
) => Promise<Result<ConfirmProductionOrderOvertimeResult, AppError>>;

export type PlacementContext = ProductionOrderPlacementContext;

export type StoredOvertimeProposal = Readonly<{
  mode: 'automatic' | 'manager_exact';
  targetBatchId: string | null;
  proposalHash: string;
  queueVersion: number;
}>;

export type PlacementOutcomeInput = Readonly<{
  locationId: string;
  productionRunId: string;
  productionOrderId: string;
  actorId: string;
  authorizedAction: 'production:queue' | 'production:override';
  idempotencyKey: string;
  idempotency: WorkEventCommandIdentity;
  result: ProductionOrderPlacementResult;
  proposal: OnlinePlacementProposal | null;
  mode: 'automatic' | 'manager_exact';
  targetBatchId: string | null;
  now: Date;
}>;

export type PlaceProductionOrderOperations = Readonly<{
  findWorkEvent: FindWorkEvent;
  lockLocationScheduling: (locationId: string) => Promise<void>;
  findStartedRuns: (locationId: string) => Promise<
    readonly Readonly<{
      productionRunId: string;
      queueVersion: number;
    }>[]
  >;
  recordPendingRunResolution: (input: {
    locationId: string;
    productionOrderId: string;
    actorId: string;
    idempotencyKey: string;
    placement: Extract<
      ProductionPendingPlacement,
      { status: 'awaiting_run' | 'ambiguous_run' }
    >;
    now: Date;
  }) => Promise<void>;
  loadContext: (
    locationId: string,
    productionRunId: string,
    productionOrderId: string,
  ) => Promise<PlacementContext | null>;
  findOvertimeProposal: (
    locationId: string,
    productionOrderId: string,
    proposalHash: string,
  ) => Promise<StoredOvertimeProposal | null>;
  recordOutcome: (input: PlacementOutcomeInput) => Promise<void>;
  commitPlacement: (
    input: PlacementOutcomeInput & {
      context: PlacementContext;
      proposal: OnlinePlacementProposal;
      overtimeConfirmed: boolean;
      orderLifecycle: ProductionOrderSchedulingMutation;
      initialBatchState: 'queued';
      initialStageState: 'planned';
      initialAttemptState: 'assigned';
    },
  ) => Promise<ProductionOrderPlacementResult>;
}>;

export type PlaceProductionOrderRepository =
  Transactional<PlaceProductionOrderOperations>;
