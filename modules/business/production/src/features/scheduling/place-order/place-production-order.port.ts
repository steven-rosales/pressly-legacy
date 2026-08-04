import type { PlaceProductionOrderFailure } from './place-production-order.failure.ts';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  WorkEventCommandIdentity,
} from '../../../foundations/language/commands/production-command.model.ts';
import type {
  OnlinePlacementProposal,
  ProductionOrderPlacementContext,
} from '../../../foundations/language/scheduling/online-placement.model.ts';
import type { ProductionOrderSchedulingMutation } from '../../../foundations/language/execution/production-lifecycle.model.ts';
import type { UnitOfWork } from '@pressly/kernel';
import type {
  ConfirmProductionOrderOvertimeCommand,
  PlaceProductionOrderAutomaticallyCommand,
  PlaceProductionOrderExactlyCommand,
} from './place-production-order.model.ts';
import type {
  AutomaticProductionOrderPlacementResult,
  ConfirmProductionOrderOvertimeResult,
  ExactProductionOrderPlacementResult,
  ProductionOrderPlacedResult,
  ProductionOrderPlacementResult,
  ProductionPendingPlacement,
} from '../../../foundations/language/scheduling/production-placement.model.ts';

export type PlaceProductionOrderAutomatically = (
  command: PlaceProductionOrderAutomaticallyCommand,
) => Promise<
  Result<AutomaticProductionOrderPlacementResult, PlaceProductionOrderFailure>
>;

export type PlaceProductionOrderExactly = (
  command: PlaceProductionOrderExactlyCommand,
) => Promise<
  Result<ExactProductionOrderPlacementResult, PlaceProductionOrderFailure>
>;

export type ConfirmProductionOrderOvertime = (
  command: ConfirmProductionOrderOvertimeCommand,
) => Promise<
  Result<ConfirmProductionOrderOvertimeResult, PlaceProductionOrderFailure>
>;

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
  ) => Promise<ProductionOrderPlacedResult>;
}>;

export type PlaceProductionOrderRepository =
  UnitOfWork<PlaceProductionOrderOperations>;
