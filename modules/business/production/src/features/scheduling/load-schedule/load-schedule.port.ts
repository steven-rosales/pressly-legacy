import type { ProductionFeatureFailure } from '../../../foundations/language/failures/production-feature.failure.ts';
import type { Result } from '@pressly/kernel';
import type { LoadScheduleCommand } from './load-schedule.model.ts';
import type { ScheduleProposal } from '../../../foundations/language/scheduling/schedule-proposal.entity.ts';

export type LoadSchedule = (
  command: LoadScheduleCommand,
) => Promise<Result<ScheduleProposal, ProductionFeatureFailure>>;

export type LoadScheduleRepository = Readonly<{
  loadSchedule: (
    locationId: string,
    scheduleRunId: string,
  ) => Promise<ScheduleProposal | null>;
}>;
