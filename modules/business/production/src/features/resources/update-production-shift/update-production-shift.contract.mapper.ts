import type {
  UpdateProductionShiftCommand as UpdateProductionShiftWireCommand,
  UpdateProductionShiftResult as UpdateProductionShiftWireResult,
} from '@pressly/contracts/production';
import type {
  UpdateProductionShiftCommand,
  UpdateProductionShiftResult,
} from './update-production-shift.model.ts';

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

export const toUpdateProductionShiftResult = (
  outcome: UpdateProductionShiftResult,
): UpdateProductionShiftWireResult => ({
  productionShift: { ...outcome.productionShift },
  supersededScheduleRunId: outcome.supersededScheduleRunId,
  replayed: outcome.replayed,
});
