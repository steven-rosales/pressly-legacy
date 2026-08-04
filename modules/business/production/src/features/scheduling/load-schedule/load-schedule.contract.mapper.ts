export {
  productionScheduleParamsSchema,
  scheduleProposalSchema,
} from '@pressly/contracts/production';
import type {
  ScheduleProposal as ScheduleProposalWireResult,
  ScheduleRunParams,
} from '@pressly/contracts/production';
import { toScheduleProposalRepresentation } from '../../../foundations/language/scheduling/schedule-proposal.projection.ts';
import type {
  LoadScheduleCommand,
  LoadScheduleResult,
} from './load-schedule.model.ts';

export const toLoadScheduleCommand = (
  params: ScheduleRunParams,
): LoadScheduleCommand => ({
  locationId: params.locationId,
  scheduleRunId: params.scheduleRunId,
});

export const toLoadScheduleResult = (
  schedule: LoadScheduleResult,
): ScheduleProposalWireResult => toScheduleProposalRepresentation(schedule);
