export {
  createScheduleRequestSchema,
  productionLocationParamsSchema,
  scheduleProposalSchema,
} from '@pressly/contracts/production';
import type {
  CreateScheduleCommand as CreateScheduleWireCommand,
  ScheduleProposal as ScheduleProposalWireResult,
} from '@pressly/contracts/production';
import { toScheduleProposalRepresentation } from '../../../foundations/language/scheduling/schedule-proposal.projection.ts';
import type {
  CreateScheduleCommand,
  CreateScheduleResult,
} from './create-schedule.model.ts';

export const toCreateScheduleCommand = (
  identity: Readonly<{ locationId: string; actorId: string }>,
  request: Omit<CreateScheduleWireCommand, 'locationId'>,
): CreateScheduleCommand => ({
  locationId: identity.locationId,
  productionShiftId: request.productionShiftId,
  schedulerConfigId: request.schedulerConfigId,
  idempotencyKey: request.idempotencyKey,
  actorId: identity.actorId,
});

export const toCreateScheduleResult = (
  schedule: CreateScheduleResult,
): ScheduleProposalWireResult => toScheduleProposalRepresentation(schedule);
