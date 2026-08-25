import type {
  ProductionOrderResolutionLifecycleDecision,
  ProductionRules,
} from '../../../model/public.ts';

export type ProductionOrderResolutionReason =
  | 'completed_outside_pressly'
  | 'processor_not_in_use'
  | 'duplicate_or_test'
  | 'order_will_not_be_produced'
  | 'other';

export type ProductionOrderRestorationReason =
  | 'manager_correction'
  | 'work_should_be_produced'
  | 'other';

type ChangeOrderResolutionScope = Readonly<{
  locationId: string;
  productionOrderId: string;
  expectedVersion: number;
  idempotencyKey: string;
  actorId: string;
  sourceStatePrecondition?: Readonly<{
    commercialState: 'open';
    admissionState: 'unreleased';
  }>;
}>;

export type ChangeOrderResolutionCommand = ChangeOrderResolutionScope &
  (
    | Readonly<{
        action: 'resolve_without_production';
        reason: ProductionOrderResolutionReason;
        note: string | null;
        confirmReviewedFacts: boolean;
      }>
    | Readonly<{
        action: 'restore';
        reason: ProductionOrderRestorationReason;
        note: string | null;
      }>
  );

export type ChangeOrderResolutionResult = Readonly<{
  locationId: string;
  orderId: string;
  action: 'resolve_without_production' | 'restore';
  resolutionState: 'open' | 'resolved_without_production';
  transitionedAt: string;
  version: number;
  replayed: boolean;
}>;

export type ChangeOrderResolutionExpectedFailure = Readonly<{
  kind: 'conflict' | 'not_found';
  code: string;
  message: string;
  safeMessage: string;
}>;

export type RestoredOrderSourceProjection = Readonly<{
  dueAt: Date;
  derivedWeightLbs: number;
  derivedWeightSource: string;
  operationalStatus:
    | 'release_pending'
    | 'intake_pending'
    | 'eligible'
    | 'ineligible';
  clearAdmissionOverride: boolean;
}>;

export type ChangeOrderResolutionFacts = Readonly<{
  productionOrderId: string;
  productionVersion: number;
  resolutionState: string;
  executionStatus: string;
  operationalStatus:
    | 'release_pending'
    | 'intake_pending'
    | 'eligible'
    | 'ineligible'
    | 'scheduled'
    | 'finished';
  sourceAdmissionState: 'unreleased' | 'released' | 'withdrawn';
  sourceCommercialState: 'open' | 'completed' | 'canceled';
  demandPhase:
    | 'expected'
    | 'inbound'
    | 'production_released'
    | 'post_production'
    | 'withdrawn';
  sourceDueAt: Date;
  sourceEstimatedWeightLbs: number | null;
  sourceEstimatedWeightSource: string | null;
  admissionOverride: 'released' | null;
  bagCount: number | null;
  hasIntake: boolean;
  hasManualAdmission: boolean;
  isPriority: boolean;
  hasPendingPlacement: boolean;
  hasShiftSelection: boolean;
  hasHistoricalPlanSelection: boolean;
  hasBatchMembership: boolean;
  hasStageAttempt: boolean;
  hasRoute: boolean;
}>;

export type ChangeOrderResolutionPolicy = Pick<
  ProductionRules,
  | 'evaluateProductionOrderResolutionTransition'
  | 'resolveProductionOrderExecutionState'
  | 'evaluateProductionOrderResolutionGuard'
  | 'deriveProductionOrderOperationalStatus'
>;

export type ChangeOrderResolutionDecision =
  | Readonly<{
      kind: 'commit';
      lifecycle: ProductionOrderResolutionLifecycleDecision;
      clearPendingPlacement: boolean;
      reviewReasons: readonly string[];
      restoredSourceProjection: RestoredOrderSourceProjection | null;
    }>
  | Readonly<{
      kind: 'reject';
      failure: ChangeOrderResolutionExpectedFailure;
    }>;
