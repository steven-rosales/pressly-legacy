import type {
  ProductionMutationResult,
  SetProductionOrderPriorityCommand,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  WorkEventInput,
} from '../command-execution/production-command.port.ts';
import type { Transactional } from '../persistence/production-transaction.port.ts';

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
    lockPriorityOrder: (
      locationId: string,
      productionOrderId: string,
    ) => Promise<Readonly<{ version: number; resolutionState: string }> | null>;
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
