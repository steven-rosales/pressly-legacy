export {
  advanceProductionStageResultSchema,
  completeStageRequestSchema,
  productionStageParamsSchema,
  startStageRequestSchema,
} from '@pressly/contracts/production';
import type {
  AdvanceProductionStageResult as AdvanceProductionStageWireResult,
  CompleteStageCommand,
  StartStageCommand,
} from '@pressly/contracts/production';
import type {
  AdvanceProductionStageResult,
  CompleteProductionStageCommand,
  ProductionStageTimingConfirmation,
  StartProductionStageCommand,
} from './advance-production-stage.model.ts';

type AdvanceProductionStageRequestScope = Readonly<{
  locationId: string;
  stageRunId: string;
  actorId: string;
}>;

type StartProductionStageRequest = Omit<
  StartStageCommand,
  'locationId' | 'stageRunId'
>;

type CompleteProductionStageRequest = Omit<
  CompleteStageCommand,
  'locationId' | 'stageRunId'
>;

const toProductionStageTimingConfirmation = (
  confirmation: ProductionStageTimingConfirmation,
): ProductionStageTimingConfirmation => ({
  observedAt: confirmation.observedAt,
  confirmationHash: confirmation.confirmationHash,
});

export const toStartProductionStageCommand = (
  request: StartProductionStageRequest,
  scope: AdvanceProductionStageRequestScope,
): StartProductionStageCommand => ({
  ...scope,
  expectedVersion: request.expectedVersion,
  idempotencyKey: request.idempotencyKey,
  transition: 'start',
  ...(request.confirmation === undefined
    ? {}
    : {
        confirmation: toProductionStageTimingConfirmation(request.confirmation),
      }),
});

export const toCompleteProductionStageCommand = (
  request: CompleteProductionStageRequest,
  scope: AdvanceProductionStageRequestScope,
): CompleteProductionStageCommand => ({
  ...scope,
  expectedVersion: request.expectedVersion,
  idempotencyKey: request.idempotencyKey,
  transition: 'complete',
  ...(request.confirmation === undefined
    ? {}
    : {
        confirmation: toProductionStageTimingConfirmation(request.confirmation),
      }),
});

export const toAdvanceProductionStageResult = (
  result: AdvanceProductionStageResult,
): AdvanceProductionStageWireResult => {
  if (!('status' in result))
    return {
      entityId: result.entityId,
      version: result.version,
      replayed: result.replayed,
    };

  const confirmationRequired = {
    status: result.status,
    stageRunId: result.stageRunId,
    stageVersion: result.stageVersion,
    code: result.code,
    message: result.message,
    confirmation: toProductionStageTimingConfirmation(result.confirmation),
    replayed: result.replayed,
  } as const;

  return result.code === 'PLANNED_START_NOT_REACHED'
    ? {
        ...confirmationRequired,
        code: result.code,
        timing: {
          plannedStartAt: result.timing.plannedStartAt,
          plannedEndAt: result.timing.plannedEndAt,
          observedAt: result.timing.observedAt,
          remainingMilliseconds: result.timing.remainingMilliseconds,
        },
      }
    : {
        ...confirmationRequired,
        code: result.code,
        timing: {
          actualStartAt: result.timing.actualStartAt,
          plannedEndAt: result.timing.plannedEndAt,
          completionBoundaryAt: result.timing.completionBoundaryAt,
          observedAt: result.timing.observedAt,
          plannedDurationMilliseconds:
            result.timing.plannedDurationMilliseconds,
          elapsedMilliseconds: result.timing.elapsedMilliseconds,
          remainingMilliseconds: result.timing.remainingMilliseconds,
        },
      };
};
