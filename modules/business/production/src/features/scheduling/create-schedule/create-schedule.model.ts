import type { ScheduleProposal } from '../../../foundations/language/scheduling/schedule-proposal.entity.ts';

export type CreateScheduleCommand = Readonly<{
  locationId: string;
  productionShiftId: string;
  schedulerConfigId: string;
  idempotencyKey: string;
  actorId: string;
}>;

export type CreateScheduleResult = ScheduleProposal;
