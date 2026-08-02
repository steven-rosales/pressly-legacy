import type {
  AssignStageMachinesCommand,
  ProductionMutationResult,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type { StageTransitionContext } from '../production-lifecycle/stage-transition.model.ts';
import type {
  FindWorkEvent,
  WorkEventInput,
} from '../command-execution/production-command.port.ts';
import type { Transactional } from '../persistence/production-transaction.port.ts';

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
