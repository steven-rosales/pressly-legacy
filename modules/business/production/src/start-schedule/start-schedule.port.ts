import type {
  ScheduleProposal,
  StartScheduleCommand,
  StartScheduleResult,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  SchedulingInput,
  Transactional,
  WorkEventCommandIdentity,
} from '../production.port.ts';

export type ScheduleStartRecord = Readonly<{
  schedule: ScheduleProposal;
  inputSnapshot: SchedulingInput;
  acceptedBy: string | null;
  acknowledgedWarningCodes: readonly string[];
}>;

export type StartSchedule = (
  command: StartScheduleCommand & Readonly<{ actorId: string }>,
) => Promise<Result<StartScheduleResult, AppError>>;

export type StartScheduleRepository = Transactional<
  Readonly<{
    findWorkEvent: FindWorkEvent;
    lockLocationScheduling: (locationId: string) => Promise<void>;
    lockShiftForStart: (
      locationId: string,
      productionShiftId: string,
    ) => Promise<boolean>;
    loadSchedule: (
      locationId: string,
      scheduleRunId: string,
    ) => Promise<ScheduleStartRecord | null>;
    lockAndValidateScheduleInput: (
      locationId: string,
      record: ScheduleStartRecord,
    ) => Promise<boolean>;
    productionRunExists: (
      locationId: string,
      productionShiftId: string,
    ) => Promise<boolean>;
    startSchedule: (input: {
      locationId: string;
      record: ScheduleStartRecord;
      actorId: string;
      idempotencyKey: string;
      idempotency: WorkEventCommandIdentity;
      now: Date;
    }) => Promise<StartScheduleResult>;
  }>
>;
