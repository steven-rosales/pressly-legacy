import type {
  CreateProductionShiftCommand,
  ProductionShift,
  UpdateProductionShiftCommand,
  UpdateProductionShiftResult,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  WorkEventInput,
} from '../command-execution/production-command.port.ts';
import type { Transactional } from '../persistence/production-transaction.port.ts';
import type { ScheduleRevisionLifecycleDecision } from '../production-lifecycle/production-lifecycle.model.ts';

export type CreateProductionShift = (
  command: CreateProductionShiftCommand & {
    actorId: string;
    idempotencyKey: string;
  },
) => Promise<Result<ProductionShift, AppError>>;

export type UpdateProductionShift = (
  command: UpdateProductionShiftCommand & { actorId: string },
) => Promise<Result<UpdateProductionShiftResult, AppError>>;

export type ManageProductionShiftRepository = Transactional<
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
