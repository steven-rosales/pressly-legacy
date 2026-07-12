import type {
  AcceptScheduleCommand,
  AcceptScheduleResult,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type { ScheduleProposal } from '@pressly/contracts';
import type {
  FindWorkEvent,
  SchedulingInput,
  Transactional,
  WorkEventCommandIdentity,
} from '../production.port.ts';

export type ScheduleAcceptanceRecord = Readonly<{
  schedule: ScheduleProposal;
  inputSnapshot: SchedulingInput;
}>;

export type AcceptSchedule = (
  command: AcceptScheduleCommand & { locationId: string; actorId: string },
) => Promise<Result<AcceptScheduleResult, AppError>>;

export type AcceptScheduleRepository = Transactional<
  Readonly<{
    findWorkEvent: FindWorkEvent;
    loadSchedule: (
      locationId: string,
      scheduleRunId: string,
    ) => Promise<ScheduleAcceptanceRecord | null>;
    lockAndValidateSelectedOrders: (
      locationId: string,
      record: ScheduleAcceptanceRecord,
    ) => Promise<boolean>;
    acceptSchedule: (
      locationId: string,
      schedule: ScheduleProposal,
      actorId: string,
      idempotencyKey: string,
      idempotency: WorkEventCommandIdentity,
      now: Date,
    ) => Promise<AcceptScheduleResult>;
  }>
>;
