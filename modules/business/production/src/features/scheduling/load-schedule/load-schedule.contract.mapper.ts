import type {
  ScheduleProposal as ScheduleProposalWireResult,
  ScheduleRunParams,
} from '@pressly/contracts/production';
import { toScheduleProposalRepresentation } from '../../../foundations/language/scheduling/schedule-proposal.projection.ts';
import type { LoadScheduleCommand } from './load-schedule.model.ts';
import type { ScheduleProposal } from '../../../foundations/language/scheduling/schedule-proposal.entity.ts';

export const toLoadScheduleCommand = (
  params: ScheduleRunParams,
): LoadScheduleCommand => ({
  locationId: params.locationId,
  scheduleRunId: params.scheduleRunId,
});

export const toLoadScheduleResult = (
  schedule: ScheduleProposal,
): ScheduleProposalWireResult => toScheduleProposalRepresentation(schedule);
