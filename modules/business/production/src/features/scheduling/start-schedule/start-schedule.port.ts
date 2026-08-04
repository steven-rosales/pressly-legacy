import type { StartScheduleFailure } from './start-schedule.failure.ts';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  WorkEventCommandIdentity,
} from '../../../foundations/language/commands/production-command.model.ts';
import type { ProductionOrderSchedulingMutation } from '../../../foundations/language/execution/production-lifecycle.model.ts';
import type { SchedulingInput } from '../../../foundations/language/scheduling/production-scheduling.model.ts';
import type { ScheduleProposal } from '../../../foundations/language/scheduling/schedule-proposal.entity.ts';
import type { UnitOfWork } from '@pressly/kernel';
import type {
  StartScheduleCommand,
  StartScheduleResult,
} from './start-schedule.model.ts';

export type ScheduleStartRecord = Readonly<{
  schedule: ScheduleProposal;
  inputSnapshot: SchedulingInput;
  acceptedBy: string | null;
  acknowledgedWarningCodes: readonly string[];
}>;

export type StartSchedule = (
  command: StartScheduleCommand,
) => Promise<Result<StartScheduleResult, StartScheduleFailure>>;

export type ScheduleStartOrder = Readonly<{
  id: string;
  operationalStatus: string;
  executionStatus: string;
  version: number;
}>;

export type ScheduleStartOrderLifecycle = ProductionOrderSchedulingMutation;

export type StartScheduleRepository = UnitOfWork<
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
