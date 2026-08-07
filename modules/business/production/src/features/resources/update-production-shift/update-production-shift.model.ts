import type { ProductionShift } from '../../../foundations/language/shifts/production-shift.entity.ts';

export type UpdateProductionShiftCommand = Readonly<{
  locationId: string;
  productionShiftId: string;
  startsAt: string;
  endsAt: string;
  effectiveFolderCount: number;
  expectedVersion: number;
  idempotencyKey: string;
}>;

export type UpdateProductionShiftResult = Readonly<{
  productionShift: ProductionShift;
  supersededScheduleRunId: string | null;
  replayed: boolean;
}>;
