import type {
  CreateProductionShiftCommand as CreateProductionShiftWireCommand,
  ProductionShift as ProductionShiftWireResult,
} from '@pressly/contracts/production';
import type { ProductionShift } from '../../../foundations/language/shifts/production-shift.entity.ts';
import type { CreateProductionShiftCommand } from './create-production-shift.model.ts';

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

export const toProductionShiftResult = (
  shift: ProductionShift,
): ProductionShiftWireResult => ({ ...shift });
