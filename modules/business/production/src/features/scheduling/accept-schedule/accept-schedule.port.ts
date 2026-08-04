import type { AcceptScheduleFailure } from './accept-schedule.failure.ts';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  WorkEventCommandIdentity,
} from '../../../foundations/language/commands/production-command.model.ts';
import type { ScheduleRevisionLifecycleDecision } from '../../../foundations/language/execution/production-lifecycle.model.ts';
import type { SchedulingInput } from '../../../foundations/language/scheduling/production-scheduling.model.ts';
import type { ScheduleProposal } from '../../../foundations/language/scheduling/schedule-proposal.entity.ts';
import type { UnitOfWork } from '@pressly/kernel';
import type {
  AcceptScheduleCommand,
  AcceptScheduleResult,
} from './accept-schedule.model.ts';

export type ScheduleAcceptanceRecord = Readonly<{
  schedule: ScheduleProposal;
  inputSnapshot: SchedulingInput;
}>;

export type AcceptSchedule = (
  command: AcceptScheduleCommand,
) => Promise<Result<AcceptScheduleResult, AcceptScheduleFailure>>;

export type AcceptScheduleRepository = UnitOfWork<
  Readonly<{
    findWorkEvent: FindWorkEvent;
    lockLocationScheduling: (locationId: string) => Promise<void>;
    loadSchedule: (
      locationId: string,
      scheduleRunId: string,
    ) => Promise<ScheduleAcceptanceRecord | null>;
    lockAndValidateScheduleInput: (
      locationId: string,
      record: ScheduleAcceptanceRecord,
    ) => Promise<boolean>;
    productionRunExists: (
      locationId: string,
      productionShiftId: string,
    ) => Promise<boolean>;
    acceptSchedule: (
      locationId: string,
      schedule: ScheduleProposal,
      actorId: string,
      acknowledgedWarningCodes: readonly string[],
      idempotencyKey: string,
      idempotency: WorkEventCommandIdentity,
      lifecycle: ScheduleRevisionLifecycleDecision,
      now: Date,
    ) => Promise<AcceptScheduleResult>;
  }>
>;
