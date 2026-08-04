export {
  productionScheduleParamsSchema,
  startScheduleRequestSchema,
  startScheduleResultSchema,
} from '@pressly/contracts/production';
import type {
  StartScheduleCommand as StartScheduleWireCommand,
  StartScheduleResult as StartScheduleWireResult,
} from '@pressly/contracts/production';
import type {
  StartScheduleCommand,
  StartScheduleResult,
} from './start-schedule.model.ts';

export const toStartScheduleCommand = (
  identity: Readonly<{
    locationId: string;
    scheduleRunId: string;
    actorId: string;
  }>,
  request: Omit<StartScheduleWireCommand, 'locationId' | 'scheduleRunId'>,
): StartScheduleCommand => ({
  locationId: identity.locationId,
  scheduleRunId: identity.scheduleRunId,
  expectedOutputPlanHash: request.expectedOutputPlanHash,
  idempotencyKey: request.idempotencyKey,
  actorId: identity.actorId,
});

export const toStartScheduleResult = (
  started: StartScheduleResult,
): StartScheduleWireResult => ({
  scheduleRunId: started.scheduleRunId,
  productionRunId: started.productionRunId,
  productionBatchIds: [...started.productionBatchIds],
  queueVersion: started.queueVersion,
  startedAt: started.startedAt,
  replayed: started.replayed,
});
