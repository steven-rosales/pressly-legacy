import type {
  AssignStageMachinesCommand,
  ProductionMutationResult,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  StageTransitionContext,
  FindWorkEvent,
  Transactional,
  WorkEventInput,
} from '../production.port.ts';

export type AssignStageMachines = (
  command: AssignStageMachinesCommand & {
    locationId: string;
    actorId: string;
  },
) => Promise<Result<ProductionMutationResult, AppError>>;

export type AssignStageMachinesRepository = Transactional<
  Readonly<{
    findWorkEvent: FindWorkEvent;
    loadStageTransitionContext: (
      locationId: string,
      stageRunId: string,
      now: Date,
    ) => Promise<StageTransitionContext | null>;
    assignStageMachines: (input: {
      locationId: string;
      stageRunId: string;
      expectedVersion: number;
      machineIds: readonly string[];
      now: Date;
    }) => Promise<ProductionMutationResult | null>;
    appendWorkEvent: (event: WorkEventInput) => Promise<void>;
  }>
>;
