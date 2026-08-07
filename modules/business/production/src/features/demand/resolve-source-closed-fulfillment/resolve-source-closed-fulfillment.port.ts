import type { Result } from '@pressly/kernel';
import type { ProductionFeatureFailure } from '../../../foundations/language/failures/production-feature.failure.ts';
import type {
  ProductionOrderResolutionCandidate,
  ResolveProductionOrderWithoutProductionCommand,
  ResolveProductionOrderWithoutProductionResult,
  ResolveSourceClosedFulfillmentCommand,
  ResolveSourceClosedFulfillmentResult,
} from './resolve-source-closed-fulfillment.model.ts';

export type ResolveSourceClosedFulfillment = (
  command: ResolveSourceClosedFulfillmentCommand,
) => Promise<
  Result<ResolveSourceClosedFulfillmentResult, ProductionFeatureFailure>
>;

export type ResolveSourceClosedFulfillmentRepository = Readonly<{
  findCandidate: (
    locationId: string,
    fulfillmentId: string,
  ) => Promise<ProductionOrderResolutionCandidate | null>;
}>;

export type ResolveProductionOrderWithoutProduction = (
  command: ResolveProductionOrderWithoutProductionCommand,
) => Promise<
  Result<
    ResolveProductionOrderWithoutProductionResult,
    ProductionFeatureFailure
  >
>;
