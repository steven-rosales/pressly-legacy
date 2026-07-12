import type {
  CreateProductionShiftCommand,
  ProductionShift,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  Transactional,
  WorkEventInput,
} from '../production.port.ts';

export type CreateProductionShift = (
  command: CreateProductionShiftCommand & {
    actorId: string;
    idempotencyKey: string;
  },
) => Promise<Result<ProductionShift, AppError>>;

export type ManageProductionShiftRepository = Transactional<
  Readonly<{
    findWorkEvent: FindWorkEvent;
    saveShift: (shift: ProductionShift) => Promise<ProductionShift>;
    appendWorkEvent: (event: WorkEventInput) => Promise<void>;
  }>
>;
