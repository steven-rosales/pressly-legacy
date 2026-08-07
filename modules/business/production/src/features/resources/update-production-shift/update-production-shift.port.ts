import type { Result, UnitOfWork } from '@pressly/kernel';
import type {
  FindWorkEvent,
  WorkEventInput,
} from '../../../foundations/language/commands/production-command.model.ts';
import type { ScheduleRevisionLifecycleDecision } from '../../../foundations/language/execution/production-lifecycle.model.ts';
import type { ProductionShift } from '../../../foundations/language/shifts/production-shift.entity.ts';
import type { ProductionFeatureFailure } from '../../../foundations/language/failures/production-feature.failure.ts';
import type {
  UpdateProductionShiftCommand,
  UpdateProductionShiftResult,
} from './update-production-shift.model.ts';

export type UpdateProductionShift = (
  command: UpdateProductionShiftCommand & Readonly<{ actorId: string }>,
) => Promise<Result<UpdateProductionShiftResult, ProductionFeatureFailure>>;

export type UpdateProductionShiftRepository = UnitOfWork<
  Readonly<{
    findWorkEvent: FindWorkEvent;
    lockLocationScheduling: (locationId: string) => Promise<void>;
    lockShift: (
      locationId: string,
      productionShiftId: string,
    ) => Promise<ProductionShift | null>;
    productionRunExists: (
      locationId: string,
      productionShiftId: string,
    ) => Promise<boolean>;
    updateShift: (input: {
      locationId: string;
      productionShiftId: string;
      startsAt: string;
      endsAt: string;
      effectiveFolderCount: number;
      expectedVersion: number;
      now: Date;
    }) => Promise<ProductionShift | null>;
    lockCurrentSchedule: (
      locationId: string,
      productionShiftId: string,
    ) => Promise<Readonly<{ scheduleRunId: string; status: string }> | null>;
    supersedeCurrentSchedule: (input: {
      locationId: string;
      scheduleRunId: string;
      lifecycle: ScheduleRevisionLifecycleDecision;
      now: Date;
    }) => Promise<string | null>;
    appendWorkEvent: (event: WorkEventInput) => Promise<void>;
  }>
>;
