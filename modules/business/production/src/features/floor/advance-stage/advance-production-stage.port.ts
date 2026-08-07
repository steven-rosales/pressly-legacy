import type { ProductionFeatureFailure } from '../../../foundations/language/failures/production-feature.failure.ts';
import type { Result } from '@pressly/kernel';
import type { StageTransitionContext } from '../../../foundations/language/execution/stage-transition.model.ts';
import type {
  FindWorkEvent,
  WorkEventInput,
} from '../../../foundations/language/commands/production-command.model.ts';
import type { ProductionMutationResult } from '../../../foundations/language/commands/production-mutation.model.ts';
import type {
  ProductionBatchLifecycleDecision,
  ProductionBatchLifecycleState,
  ProductionOrderStageAttemptMutation,
  ProductionTerminalLifecycleDecisions,
} from '../../../foundations/language/execution/production-lifecycle.model.ts';
import type { UnitOfWork } from '@pressly/kernel';
import type {
  AdvanceProductionStageResult,
  CompleteProductionStageCommand,
  StartProductionStageCommand,
} from './advance-production-stage.model.ts';

export type AdvanceProductionStage = {
  (
    command: StartProductionStageCommand,
  ): Promise<Result<AdvanceProductionStageResult, ProductionFeatureFailure>>;
  (
    command: CompleteProductionStageCommand,
  ): Promise<Result<AdvanceProductionStageResult, ProductionFeatureFailure>>;
};

export type AdvanceProductionStageRepository = UnitOfWork<
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
