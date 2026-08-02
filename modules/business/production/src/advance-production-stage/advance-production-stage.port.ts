import type {
  AdvanceProductionStageResult,
  CompleteStageCommand,
  ProductionMutationResult,
  StartStageCommand,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type { StageTransitionContext } from '../production-lifecycle/stage-transition.model.ts';
import type {
  FindWorkEvent,
  WorkEventInput,
} from '../command-execution/production-command.port.ts';
import type {
  ProductionBatchLifecycleDecision,
  ProductionBatchLifecycleState,
  ProductionOrderStageAttemptMutation,
  ProductionTerminalLifecycleDecisions,
} from '../production-lifecycle/production-lifecycle.model.ts';
import type { Transactional } from '../persistence/production-transaction.port.ts';

export type StartProductionStageCommand = StartStageCommand & {
  actorId: string;
  transition: 'start';
};

export type CompleteProductionStageCommand = CompleteStageCommand & {
  actorId: string;
  transition: 'complete';
};

export type AdvanceProductionStageCommand =
  | StartProductionStageCommand
  | CompleteProductionStageCommand;

export type AdvanceProductionStage = {
  (
    command: StartProductionStageCommand,
  ): Promise<Result<AdvanceProductionStageResult, AppError>>;
  (
    command: CompleteProductionStageCommand,
  ): Promise<Result<AdvanceProductionStageResult, AppError>>;
};

export type AdvanceProductionStageRepository = Transactional<
  Readonly<{
    findWorkEvent: FindWorkEvent;
    loadStageTransitionContext: (
      locationId: string,
      stageRunId: string,
      now: Date,
    ) => Promise<StageTransitionContext | null>;
    transitionStage: (input: {
      locationId: string;
      stageRunId: string;
      expectedVersion: number;
      stageLifecycle: Readonly<{
        from: 'planned' | 'started';
        state: 'started' | 'completed';
      }>;
      batchId: string;
      batchExpectedVersion: number;
      batchState: ProductionBatchLifecycleState;
      batchLifecycle: ProductionBatchLifecycleDecision | null;
      freezeMembership: boolean;
      attemptLifecycles: readonly ProductionOrderStageAttemptMutation[];
      terminalLifecycle: ProductionTerminalLifecycleDecisions | null;
      actorId: string;
      now: Date;
    }) => Promise<ProductionMutationResult | null>;
    appendWorkEvent: (event: WorkEventInput) => Promise<void>;
  }>
>;
