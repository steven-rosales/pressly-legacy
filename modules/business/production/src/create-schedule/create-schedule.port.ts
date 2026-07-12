import type {
  CreateScheduleCommand,
  ScheduleProposal,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  SchedulingInput,
  SchedulingOutput,
  Transactional,
} from '../production.port.ts';

export type CreateSchedule = (
  command: CreateScheduleCommand & { locationId: string },
) => Promise<Result<ScheduleProposal, AppError>>;

export type CreateScheduleRepository = Transactional<
  Readonly<{
    loadSchedulingInput: (
      input: CreateScheduleCommand & { locationId: string },
    ) => Promise<SchedulingInput | null>;
    saveSchedule: (input: {
      locationId: string;
      id: string;
      schedulingInput: SchedulingInput;
      output: SchedulingOutput;
      now: Date;
    }) => Promise<ScheduleProposal>;
  }>
>;
