import type { ProductionMutationResult } from '../../../foundations/language/commands/production-mutation.model.ts';
import type {
  ProductionStageCompletionTiming,
  ProductionStageStartTiming,
} from '../../../foundations/language/execution/production-lifecycle.model.ts';

export type ProductionStageTimingConfirmation = Readonly<{
  observedAt: string;
  confirmationHash: string;
}>;

type AdvanceProductionStageCommandScope = Readonly<{
  locationId: string;
  stageRunId: string;
  expectedVersion: number;
  idempotencyKey: string;
  actorId: string;
}>;

export type StartProductionStageCommand = AdvanceProductionStageCommandScope &
  Readonly<{
    transition: 'start';
    confirmation?: ProductionStageTimingConfirmation;
  }>;

export type CompleteProductionStageCommand =
  AdvanceProductionStageCommandScope &
    Readonly<{
      transition: 'complete';
      confirmation?: ProductionStageTimingConfirmation;
    }>;

export type AdvanceProductionStageCommand =
  | StartProductionStageCommand
  | CompleteProductionStageCommand;

type ProductionStageConfirmationRequiredResult = Readonly<{
  status: 'confirmation_required';
  stageRunId: string;
  stageVersion: number;
  message: string;
  confirmation: ProductionStageTimingConfirmation;
  replayed: false;
}>;

export type ProductionStageStartConfirmationRequiredResult =
  ProductionStageConfirmationRequiredResult &
    Readonly<{
      code: 'PLANNED_START_NOT_REACHED';
      timing: ProductionStageStartTiming;
    }>;

export type ProductionStageCompletionConfirmationRequiredResult =
  ProductionStageConfirmationRequiredResult &
    Readonly<{
      code: 'PULSE_BOUNDARY_NOT_REACHED';
      timing: ProductionStageCompletionTiming;
    }>;

export type AdvanceProductionStageResult =
  | ProductionMutationResult
  | ProductionStageStartConfirmationRequiredResult
  | ProductionStageCompletionConfirmationRequiredResult;
