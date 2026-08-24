import type { ScheduleProposal } from '../../../read-models/production-schedule/contract.ts';

export const loadScheduleOperationId = 'production.load-schedule.v1' as const;

export type LoadScheduleInput = Readonly<{
  locationId: string;
  scheduleRunId: string;
}>;

export type LoadScheduleExpectedFailure = Readonly<{
  tag: 'ProductionFailure';
  kind: 'not_found';
  code: 'schedule_not_found';
  message: 'The schedule proposal was not found.';
  safeMessage: 'The schedule proposal was not found.';
}>;

export type LoadScheduleRepository = Readonly<{
  load: (input: LoadScheduleInput) => Promise<ScheduleProposal | null>;
}>;
