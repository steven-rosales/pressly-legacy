import type {
  ProductionMutationResult,
  StageCommand,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  StageTransitionContext,
  FindWorkEvent,
  Transactional,
  WorkEventInput,
} from '../production.port.ts';

export type AdvanceProductionStage = (
  command: StageCommand & {
    locationId: string;
    actorId: string;
    transition: 'start' | 'complete';
  },
) => Promise<Result<ProductionMutationResult, AppError>>;

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
