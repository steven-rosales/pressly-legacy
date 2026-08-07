import type { ProductionFeatureFailure } from '../../../foundations/language/failures/production-feature.failure.ts';
import type { Result } from '@pressly/kernel';
import type { StageTransitionContext } from '../../../foundations/language/execution/stage-transition.model.ts';
import type {
  FindWorkEvent,
  WorkEventInput,
} from '../../../foundations/language/commands/production-command.model.ts';
import type { ProductionMutationResult } from '../../../foundations/language/commands/production-mutation.model.ts';
import type { UnitOfWork } from '@pressly/kernel';

export type AssignStageMachinesCommand = Readonly<{
  locationId: string;
  stageRunId: string;
  actorId: string;
  expectedVersion: number;
  idempotencyKey: string;
  machineIds: readonly string[];
}>;

export type AssignStageMachines = (
  command: AssignStageMachinesCommand,
) => Promise<Result<ProductionMutationResult, ProductionFeatureFailure>>;

export type AssignStageMachinesRepository = UnitOfWork<
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
