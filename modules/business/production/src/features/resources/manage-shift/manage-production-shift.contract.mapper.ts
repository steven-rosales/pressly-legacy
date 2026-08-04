export {
  createProductionShiftRequestSchema,
  productionLocationParamsSchema,
  productionShiftParamsSchema,
  productionShiftSchema,
  updateProductionShiftRequestSchema,
  updateProductionShiftResultSchema,
} from '@pressly/contracts/production';
import type {
  CreateProductionShiftCommand as CreateProductionShiftWireCommand,
  ProductionShift as ProductionShiftWireResult,
  UpdateProductionShiftCommand as UpdateProductionShiftWireCommand,
  UpdateProductionShiftResult as UpdateProductionShiftWireResult,
} from '@pressly/contracts/production';
import type {
  CreateProductionShiftCommand,
  UpdateProductionShiftCommand,
  UpdateProductionShiftResult,
} from './manage-production-shift.model.ts';
import type { ProductionShift } from '../../../foundations/language/shifts/production-shift.entity.ts';

export const toCreateProductionShiftCommand = (
  locationId: string,
  command: Omit<CreateProductionShiftWireCommand, 'locationId'>,
): CreateProductionShiftCommand => ({
  locationId,
  startsAt: command.startsAt,
  endsAt: command.endsAt,
  timezone: command.timezone,
  effectiveFolderCount: command.effectiveFolderCount,
  idempotencyKey: command.idempotencyKey,
});

export const toUpdateProductionShiftCommand = (
  locationId: string,
  productionShiftId: string,
  command: Omit<
    UpdateProductionShiftWireCommand,
    'locationId' | 'productionShiftId'
  >,
): UpdateProductionShiftCommand => ({
  locationId,
  productionShiftId,
  startsAt: command.startsAt,
  endsAt: command.endsAt,
  effectiveFolderCount: command.effectiveFolderCount,
  expectedVersion: command.expectedVersion,
  idempotencyKey: command.idempotencyKey,
});

export const toProductionShiftResult = (
  shift: ProductionShift,
): ProductionShiftWireResult => ({ ...shift });

export const toUpdateProductionShiftResult = (
  outcome: UpdateProductionShiftResult,
): UpdateProductionShiftWireResult => ({
  productionShift: toProductionShiftResult(outcome.productionShift),
  supersededScheduleRunId: outcome.supersededScheduleRunId,
  replayed: outcome.replayed,
});
