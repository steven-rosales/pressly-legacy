import type { CreateScheduleFailure } from './create-schedule.failure.ts';
import type { Result } from '@pressly/kernel';
import type {
  SchedulingInput,
  SchedulingOutput,
} from '../../../foundations/language/scheduling/production-scheduling.model.ts';
import type { ScheduleSupersessionDecision } from '../../../foundations/language/execution/production-lifecycle.model.ts';
import type {
  FindWorkEvent,
  WorkEventInput,
} from '../../../foundations/language/commands/production-command.model.ts';
import type { UnitOfWork } from '@pressly/kernel';
import type { ScheduleProposal } from '../../../foundations/language/scheduling/schedule-proposal.entity.ts';
import type {
  CreateScheduleCommand,
  CreateScheduleResult,
} from './create-schedule.model.ts';

export type CreateSchedule = (
  command: CreateScheduleCommand,
) => Promise<Result<CreateScheduleResult, CreateScheduleFailure>>;

export type CreateScheduleRepository = UnitOfWork<
  Readonly<{
    findWorkEvent: FindWorkEvent;
    lockLocationScheduling: (locationId: string) => Promise<void>;
    lockShiftForPlanning: (
      locationId: string,
      productionShiftId: string,
    ) => Promise<'available' | 'not_found' | 'run_exists'>;
    loadSchedulingInput: (
      input: Pick<
        CreateScheduleCommand,
        'locationId' | 'productionShiftId' | 'schedulerConfigId'
      >,
    ) => Promise<
      SchedulingInput | 'selection_empty' | 'selection_invalid' | null
    >;
    loadCurrentPlan: (
      locationId: string,
      productionShiftId: string,
    ) => Promise<Readonly<{ scheduleRunId: string; status: string }> | null>;
    saveSchedule: (input: {
      locationId: string;
      id: string;
      schedulingInput: SchedulingInput;
      output: SchedulingOutput;
      initialStatus: 'draft';
      supersede: ScheduleSupersessionDecision | null;
      now: Date;
    }) => Promise<ScheduleProposal>;
    appendWorkEvent: (event: WorkEventInput) => Promise<void>;
  }>
>;
