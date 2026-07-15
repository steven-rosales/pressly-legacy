import type {
  ProductionMutationResult,
  SetProductionOrderPriorityCommand,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  Transactional,
  WorkEventInput,
} from '../production.port.ts';

export type SetProductionOrderPriority = (
  command: SetProductionOrderPriorityCommand & {
    locationId: string;
    actorId: string;
  },
) => Promise<Result<ProductionMutationResult, AppError>>;

export type SetProductionOrderPriorityRepository = Transactional<
  Readonly<{
    findWorkEvent: FindWorkEvent;
    lockLocationScheduling: (locationId: string) => Promise<void>;
    setOrderPriority: (input: {
      locationId: string;
      productionOrderId: string;
      priority: boolean;
      expectedVersion: number;
      now: Date;
    }) => Promise<ProductionMutationResult | null>;
    appendWorkEvent: (event: WorkEventInput) => Promise<void>;
  }>
>;
