export {
  automaticProductionOrderPlacementResultSchema,
  confirmProductionOrderOvertimeRequestSchema,
  confirmProductionOrderOvertimeResultSchema,
  exactProductionOrderPlacementResultSchema,
  placeProductionOrderAutomaticallyRequestSchema,
  placeProductionOrderExactlyRequestSchema,
  productionIdSchema,
  productionRunParamsSchema,
} from '@pressly/contracts/production';
import type {
  AutomaticProductionOrderPlacementResult as AutomaticProductionOrderPlacementWireResult,
  ConfirmProductionOrderOvertimeCommand as ConfirmProductionOrderOvertimeWireCommand,
  ConfirmProductionOrderOvertimeResult as ConfirmProductionOrderOvertimeWireResult,
  ExactProductionOrderPlacementResult as ExactProductionOrderPlacementWireResult,
  PlaceProductionOrderAutomaticallyCommand as PlaceProductionOrderAutomaticallyWireCommand,
  PlaceProductionOrderExactlyCommand as PlaceProductionOrderExactlyWireCommand,
  ProductionOrderPlacementResult as ProductionOrderPlacementWireResult,
} from '@pressly/contracts/production';
import type {
  ConfirmProductionOrderOvertimeCommand,
  PlaceProductionOrderAutomaticallyCommand,
  PlaceProductionOrderExactlyCommand,
  PlacementActor,
} from './place-production-order.model.ts';
import type {
  AutomaticProductionOrderPlacementResult,
  ConfirmProductionOrderOvertimeResult,
  ExactProductionOrderPlacementResult,
  ProductionOrderPlacementResult,
} from '../../../foundations/language/scheduling/production-placement.model.ts';

type PlacementIdentity = Readonly<{
  locationId: string;
  productionRunId: string;
  productionOrderId: string;
}> &
  PlacementActor;

export const toPlaceProductionOrderAutomaticallyCommand = (
  identity: PlacementIdentity,
  request: Omit<
    PlaceProductionOrderAutomaticallyWireCommand,
    'locationId' | 'productionRunId' | 'productionOrderId'
  >,
): PlaceProductionOrderAutomaticallyCommand => ({
  ...identity,
  expectedQueueVersion: request.expectedQueueVersion,
  idempotencyKey: request.idempotencyKey,
});

export const toPlaceProductionOrderExactlyCommand = (
  identity: PlacementIdentity & Readonly<{ productionBatchId: string }>,
  request: Omit<
    PlaceProductionOrderExactlyWireCommand,
    'locationId' | 'productionRunId' | 'productionOrderId' | 'productionBatchId'
  >,
): PlaceProductionOrderExactlyCommand => ({
  ...identity,
  expectedQueueVersion: request.expectedQueueVersion,
  expectedBatchVersion: request.expectedBatchVersion,
  idempotencyKey: request.idempotencyKey,
});

export const toConfirmProductionOrderOvertimeCommand = (
  identity: PlacementIdentity,
  request: Omit<
    ConfirmProductionOrderOvertimeWireCommand,
    'locationId' | 'productionRunId' | 'productionOrderId'
  >,
): ConfirmProductionOrderOvertimeCommand => ({
  ...identity,
  expectedQueueVersion: request.expectedQueueVersion,
  proposalHash: request.proposalHash,
  idempotencyKey: request.idempotencyKey,
});

function toProductionOrderPlacementWireResult(
  placement: AutomaticProductionOrderPlacementResult,
): AutomaticProductionOrderPlacementWireResult;
function toProductionOrderPlacementWireResult(
  placement: ExactProductionOrderPlacementResult,
): ExactProductionOrderPlacementWireResult;
function toProductionOrderPlacementWireResult(
  placement: ConfirmProductionOrderOvertimeResult,
): ConfirmProductionOrderOvertimeWireResult;
function toProductionOrderPlacementWireResult(
  placement: ProductionOrderPlacementResult,
): ProductionOrderPlacementWireResult {
  switch (placement.status) {
    case 'placed':
      return {
        ...placement,
        affectedBatchIds: [...placement.affectedBatchIds],
      };
    case 'confirmation_required':
      return {
        ...placement,
        target: { ...placement.target },
        affectedBatchIds: [...placement.affectedBatchIds],
      };
    case 'not_placed':
      return { ...placement };
  }
}

export const toAutomaticProductionOrderPlacementResult = (
  placement: AutomaticProductionOrderPlacementResult,
): AutomaticProductionOrderPlacementWireResult =>
  toProductionOrderPlacementWireResult(placement);

export const toExactProductionOrderPlacementResult = (
  placement: ExactProductionOrderPlacementResult,
): ExactProductionOrderPlacementWireResult =>
  toProductionOrderPlacementWireResult(placement);

export const toConfirmProductionOrderOvertimeResult = (
  placement: ConfirmProductionOrderOvertimeResult,
): ConfirmProductionOrderOvertimeWireResult =>
  toProductionOrderPlacementWireResult(placement);
