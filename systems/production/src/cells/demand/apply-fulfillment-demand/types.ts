import type {
  OrderDemandPhase,
  ProductionRules,
} from '../../../model/public.ts';

export const applyFulfillmentDemandOperationId =
  'production.apply-fulfillment-demand.v1' as const;

export const applyFulfillmentDemandSystemActorId =
  '00000000-0000-4000-8000-000000000000' as const;

export type FulfillmentAdmissionState = 'unreleased' | 'released' | 'withdrawn';

export type FulfillmentCommercialState = 'open' | 'completed' | 'canceled';

export type ApplyFulfillmentDemandCommand = Readonly<{
  fulfillmentId: string;
  fulfillmentVersion: number;
  projectionHash: string;
  displayReference: string | null;
  locationId: string;
  admissionState: FulfillmentAdmissionState;
  commercialState: FulfillmentCommercialState;
  dueAt: string;
  observedAt: string;
  estimatedWeightLbs: number | null;
  estimatedWeightSource: 'external_estimate' | null;
  /** Exact Orders outbox identity, currently `order-outbox:<eventId>`. */
  idempotencyKey: string;
}>;

export type ApplyFulfillmentDemandResult = Readonly<{
  orderDemandId: string;
  productionOrderId: string | null;
  outcome: 'applied' | 'ignored_older' | 'unchanged';
  replayed: boolean;
}>;

export type ApplyFulfillmentDemandValidationFailure = Readonly<{
  kind: 'validation';
  classification: 'malformed' | 'semantic';
  code: string;
  message: string;
  safeMessage: string;
}>;

export type ApplyFulfillmentDemandConflictFailure = Readonly<{
  kind: 'conflict';
  code: string;
  message: string;
  safeMessage: string;
}>;

export type ApplyFulfillmentDemandNotFoundFailure = Readonly<{
  kind: 'not_found';
  code: string;
  message: string;
  safeMessage: string;
}>;

export type ApplyFulfillmentDemandExpectedFailure =
  | ApplyFulfillmentDemandValidationFailure
  | ApplyFulfillmentDemandConflictFailure
  | ApplyFulfillmentDemandNotFoundFailure;

export type StoredFulfillmentDemand = Readonly<{
  orderDemandId: string;
  productionOrderId: string | null;
  fulfillmentId: string;
  fulfillmentVersion: number;
  projectionHash: string;
  locationId: string;
  admissionState: FulfillmentAdmissionState;
  commercialState: FulfillmentCommercialState;
  dueAt: string;
  estimatedWeightLbs: number | null;
  estimatedWeightSource: 'external_estimate' | null;
  bagCount: number | null;
  admissionOverride: 'released' | null;
  productionExecutionStatus: string | null;
  productionResolutionState: 'open' | 'resolved_without_production' | null;
  productionStatus:
    | 'release_pending'
    | 'intake_pending'
    | 'eligible'
    | 'ineligible'
    | 'scheduled'
    | 'finished'
    | null;
}>;

export type FulfillmentProductionMutation =
  | Readonly<{ action: 'none' }>
  | Readonly<{ action: 'preserve' }>
  | Readonly<{
      action: 'create' | 'update';
      status:
        | 'release_pending'
        | 'intake_pending'
        | 'eligible'
        | 'ineligible'
        | 'scheduled'
        | 'finished';
    }>;

export type ApplyFulfillmentDemandPolicy = Pick<
  ProductionRules,
  | 'evaluateDemandLifecycle'
  | 'initialProductionOrderExecutionState'
  | 'resolveProductionOrderExecutionState'
  | 'deriveProductionOrderOperationalStatus'
>;

export type ApplyFulfillmentDemandDecision =
  | Readonly<{
      kind: 'reject';
      failure: ApplyFulfillmentDemandExpectedFailure;
    }>
  | Readonly<{
      kind: 'audit';
      outcome: 'ignored_older' | 'unchanged';
    }>
  | Readonly<{
      kind: 'apply';
      production: FulfillmentProductionMutation;
      initialExecutionState: 'unassigned';
    }>;

export type ApplyFulfillmentDemandPhase = Exclude<
  OrderDemandPhase,
  'inbound' | 'post_production'
>;
