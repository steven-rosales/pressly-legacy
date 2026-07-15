import type {
  AdvanceProductionStageResult,
  CompleteStageCommand,
  ProductionMutationResult,
  StartStageCommand,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  StageTransitionContext,
  FindWorkEvent,
  Transactional,
  WorkEventInput,
} from '../production.port.ts';

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
  ): Promise<Result<ProductionMutationResult, AppError>>;
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
      nextState: 'started' | 'completed';
      actorId: string;
      now: Date;
    }) => Promise<ProductionMutationResult | null>;
    appendWorkEvent: (event: WorkEventInput) => Promise<void>;
  }>
>;
