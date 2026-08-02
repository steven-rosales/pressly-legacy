import type {
  ScheduleProposal,
  StartScheduleCommand,
  StartScheduleResult,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  WorkEventCommandIdentity,
} from '../command-execution/production-command.port.ts';
import type { ProductionOrderSchedulingMutation } from '../production-lifecycle/production-lifecycle.model.ts';
import type { SchedulingInput } from '../scheduling/production-scheduling.port.ts';
import type { Transactional } from '../persistence/production-transaction.port.ts';

export type ScheduleStartRecord = Readonly<{
  schedule: ScheduleProposal;
  inputSnapshot: SchedulingInput;
  acceptedBy: string | null;
  acknowledgedWarningCodes: readonly string[];
}>;

export type StartSchedule = (
  command: StartScheduleCommand & Readonly<{ actorId: string }>,
) => Promise<Result<StartScheduleResult, AppError>>;

export type ScheduleStartOrder = Readonly<{
  id: string;
  operationalStatus: string;
  executionStatus: string;
  version: number;
}>;

export type ScheduleStartOrderLifecycle = ProductionOrderSchedulingMutation;

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
    lockAndLoadStartOrders: (
      locationId: string,
      record: ScheduleStartRecord,
    ) => Promise<readonly ScheduleStartOrder[] | null>;
    productionRunExists: (
      locationId: string,
      productionShiftId: string,
    ) => Promise<boolean>;
    startSchedule: (input: {
      locationId: string;
      record: ScheduleStartRecord;
      actorId: string;
      productionRunStatus: 'started';
      orderLifecycles: readonly ScheduleStartOrderLifecycle[];
      initialBatchState: 'queued';
      initialStageState: 'planned';
      initialAttemptState: 'assigned';
      idempotencyKey: string;
      idempotency: WorkEventCommandIdentity;
      now: Date;
    }) => Promise<StartScheduleResult>;
  }>
>;
