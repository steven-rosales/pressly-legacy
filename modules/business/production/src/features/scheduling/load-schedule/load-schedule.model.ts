import type { ScheduleProposal } from '../../../foundations/language/scheduling/schedule-proposal.entity.ts';

export type LoadScheduleCommand = Readonly<{
  locationId: string;
  scheduleRunId: string;
}>;

export type LoadScheduleResult = ScheduleProposal;
