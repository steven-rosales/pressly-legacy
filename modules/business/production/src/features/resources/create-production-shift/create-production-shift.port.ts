import type { Result, UnitOfWork } from '@pressly/kernel';
import type {
  FindWorkEvent,
  WorkEventInput,
} from '../../../foundations/language/commands/production-command.model.ts';
import type { ProductionShift } from '../../../foundations/language/shifts/production-shift.entity.ts';
import type { ProductionFeatureFailure } from '../../../foundations/language/failures/production-feature.failure.ts';
import type { CreateProductionShiftCommand } from './create-production-shift.model.ts';

export type CreateProductionShift = (
  command: CreateProductionShiftCommand & Readonly<{ actorId: string }>,
) => Promise<Result<ProductionShift, ProductionFeatureFailure>>;

export type CreateProductionShiftRepository = UnitOfWork<
  Readonly<{
    findWorkEvent: FindWorkEvent;
    saveShift: (shift: ProductionShift) => Promise<ProductionShift>;
    appendWorkEvent: (event: WorkEventInput) => Promise<void>;
  }>
>;
