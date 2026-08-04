import type { ProductionPlacementMode } from '../../../foundations/language/scheduling/production-placement.model.ts';

export type PlacementActor = Readonly<{
  actorId: string;
  authorizedAction: 'production:queue' | 'production:override';
}>;

type ProductionQueueCommand = Readonly<{
  locationId: string;
  productionRunId: string;
  productionOrderId: string;
  expectedQueueVersion: number;
  idempotencyKey: string;
}> &
  PlacementActor;

export type PlaceProductionOrderAutomaticallyCommand = ProductionQueueCommand;

export type PlaceProductionOrderExactlyCommand = ProductionQueueCommand &
  Readonly<{
    productionBatchId: string;
    expectedBatchVersion: number;
  }>;

export type ConfirmProductionOrderOvertimeCommand = ProductionQueueCommand &
  Readonly<{ proposalHash: string }>;

export type AutomaticPlacementAttemptCommand = Readonly<{
  locationId: string;
  productionOrderId: string;
  idempotencyKey: string;
}> &
  PlacementActor;

export type PlacementMode =
  | Readonly<{ type: Extract<ProductionPlacementMode, 'automatic'> }>
  | Readonly<{
      type: Extract<ProductionPlacementMode, 'manager_exact'>;
      targetBatchId: string;
    }>;
