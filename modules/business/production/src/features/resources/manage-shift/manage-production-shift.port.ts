import type { ManageProductionShiftFailure } from './manage-production-shift.failure.ts';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  WorkEventInput,
} from '../../../foundations/language/commands/production-command.model.ts';
import type { UnitOfWork } from '@pressly/kernel';
import type { ScheduleRevisionLifecycleDecision } from '../../../foundations/language/execution/production-lifecycle.model.ts';
import type { ProductionShift } from '../../../foundations/language/shifts/production-shift.entity.ts';
import type {
  CreateProductionShiftCommand,
  UpdateProductionShiftCommand,
  UpdateProductionShiftResult,
} from './manage-production-shift.model.ts';

export type CreateProductionShift = (
  command: CreateProductionShiftCommand & {
    actorId: string;
    idempotencyKey: string;
  },
) => Promise<Result<ProductionShift, ManageProductionShiftFailure>>;

export type UpdateProductionShift = (
  command: UpdateProductionShiftCommand & { actorId: string },
) => Promise<Result<UpdateProductionShiftResult, ManageProductionShiftFailure>>;

export type ManageProductionShiftRepository = UnitOfWork<
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
    saveShift: (shift: ProductionShift) => Promise<ProductionShift>;
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
