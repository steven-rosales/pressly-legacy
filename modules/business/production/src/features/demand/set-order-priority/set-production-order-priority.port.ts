import type { SetProductionOrderPriorityFailure } from './set-production-order-priority.failure.ts';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  WorkEventInput,
} from '../../../foundations/language/commands/production-command.model.ts';
import type { ProductionMutationResult } from '../../../foundations/language/commands/production-mutation.model.ts';
import type { UnitOfWork } from '@pressly/kernel';

export type SetProductionOrderPriorityCommand = Readonly<{
  locationId: string;
  productionOrderId: string;
  actorId: string;
  priority: boolean;
  expectedVersion: number;
  idempotencyKey: string;
}>;

export type SetProductionOrderPriority = (
  command: SetProductionOrderPriorityCommand,
) => Promise<
  Result<ProductionMutationResult, SetProductionOrderPriorityFailure>
>;

export type SetProductionOrderPriorityRepository = UnitOfWork<
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
