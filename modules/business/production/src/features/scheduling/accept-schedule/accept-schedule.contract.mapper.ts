export {
  acceptScheduleRequestSchema,
  acceptScheduleResultSchema,
  productionScheduleParamsSchema,
} from '@pressly/contracts/production';
import type {
  AcceptScheduleCommand as AcceptScheduleWireCommand,
  AcceptScheduleResult as AcceptScheduleWireResult,
} from '@pressly/contracts/production';
import type {
  AcceptScheduleCommand,
  AcceptScheduleResult,
} from './accept-schedule.model.ts';

export const toAcceptScheduleCommand = (
  identity: Readonly<{
    locationId: string;
    scheduleRunId: string;
    actorId: string;
  }>,
  request: Omit<AcceptScheduleWireCommand, 'locationId' | 'scheduleRunId'>,
): AcceptScheduleCommand => ({
  locationId: identity.locationId,
  scheduleRunId: identity.scheduleRunId,
  expectedOutputPlanHash: request.expectedOutputPlanHash,
  acknowledgedWarningCodes: [...request.acknowledgedWarningCodes],
  idempotencyKey: request.idempotencyKey,
  actorId: identity.actorId,
});

export const toAcceptScheduleResult = (
  accepted: AcceptScheduleResult,
): AcceptScheduleWireResult => ({
  scheduleRunId: accepted.scheduleRunId,
  productionShiftId: accepted.productionShiftId,
  acceptedAt: accepted.acceptedAt,
  replayed: accepted.replayed,
});
