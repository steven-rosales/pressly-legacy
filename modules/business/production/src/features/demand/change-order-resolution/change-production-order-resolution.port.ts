import type { ProductionFeatureFailure } from '../../../foundations/language/failures/production-feature.failure.ts';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  WorkEventInput,
} from '../../../foundations/language/commands/production-command.model.ts';
import type { UnitOfWork } from '@pressly/kernel';
import type {
  ChangeProductionOrderResolutionCommand,
  ChangeProductionOrderResolutionInput,
  ChangeProductionOrderResolutionResult,
  LockedProductionOrderResolution,
} from './change-production-order-resolution.model.ts';

export type ChangeProductionOrderResolution = (
  command: ChangeProductionOrderResolutionCommand,
) => Promise<
  Result<ChangeProductionOrderResolutionResult, ProductionFeatureFailure>
>;

export type ChangeProductionOrderResolutionRepository = UnitOfWork<
  Readonly<{
    findWorkEvent: FindWorkEvent;
    lockLocationScheduling: (locationId: string) => Promise<void>;
    lockOrder: (
      locationId: string,
      orderId: string,
    ) => Promise<LockedProductionOrderResolution | null>;
    changeResolution: (
      input: ChangeProductionOrderResolutionInput,
    ) => Promise<ChangeProductionOrderResolutionResult | null>;
    appendWorkEvent: (event: WorkEventInput) => Promise<void>;
  }>
>;
