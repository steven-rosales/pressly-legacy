export {
  changeProductionOrderResolutionRequestSchema,
  changeProductionOrderResolutionResultSchema,
  productionOrderParamsSchema,
} from '@pressly/contracts/production';
import type {
  ChangeProductionOrderResolutionRequest,
  ChangeProductionOrderResolutionResult as ChangeProductionOrderResolutionWireResult,
} from '@pressly/contracts/production';
import type {
  ChangeProductionOrderResolutionCommand,
  ChangeProductionOrderResolutionResult,
} from './change-production-order-resolution.model.ts';

export type ChangeProductionOrderResolutionRequestScope = Readonly<{
  locationId: string;
  orderId: string;
  actorId: string;
}>;

export const toChangeProductionOrderResolutionCommand = (
  request: ChangeProductionOrderResolutionRequest,
  scope: ChangeProductionOrderResolutionRequestScope,
): ChangeProductionOrderResolutionCommand =>
  request.action === 'resolve_without_production'
    ? {
        ...scope,
        action: request.action,
        reason: request.reason,
        note: request.note,
        confirmReviewedFacts: request.confirmReviewedFacts,
        expectedVersion: request.expectedVersion,
        idempotencyKey: request.idempotencyKey,
      }
    : {
        ...scope,
        action: request.action,
        reason: request.reason,
        note: request.note,
        expectedVersion: request.expectedVersion,
        idempotencyKey: request.idempotencyKey,
      };

export const toChangeProductionOrderResolutionResult = (
  result: ChangeProductionOrderResolutionResult,
): ChangeProductionOrderResolutionWireResult => ({
  locationId: result.locationId,
  orderId: result.orderId,
  action: result.action,
  resolutionState: result.resolutionState,
  transitionedAt: result.transitionedAt,
  version: result.version,
  replayed: result.replayed,
});
