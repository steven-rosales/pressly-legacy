import type {
  CreateScheduleCommand,
  ScheduleProposal,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  SchedulingInput,
  SchedulingOutput,
  ScheduleSupersessionDecision,
  FindWorkEvent,
  Transactional,
  WorkEventInput,
} from '../production.port.ts';

export type CreateSchedule = (
  command: CreateScheduleCommand & { locationId: string; actorId: string },
) => Promise<Result<ScheduleProposal, AppError>>;

export type CreateScheduleRepository = Transactional<
  Readonly<{
    findWorkEvent: FindWorkEvent;
    lockLocationScheduling: (locationId: string) => Promise<void>;
    lockShiftForPlanning: (
      locationId: string,
      productionShiftId: string,
    ) => Promise<'available' | 'not_found' | 'run_exists'>;
    loadSchedulingInput: (
      input: CreateScheduleCommand & { locationId: string },
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
