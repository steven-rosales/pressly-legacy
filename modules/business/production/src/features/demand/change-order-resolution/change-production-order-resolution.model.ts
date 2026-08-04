import type { ProductionOrderResolutionLifecycleDecision } from '../../../foundations/language/execution/production-lifecycle.model.ts';

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

type ProductionOrderResolutionCommandScope = Readonly<{
  locationId: string;
  orderId: string;
  expectedVersion: number;
  idempotencyKey: string;
  actorId: string;
  sourceStatePrecondition?: Readonly<{
    commercialState: 'open';
    admissionState: 'unreleased';
  }>;
}>;

export type ChangeProductionOrderResolutionCommand =
  ProductionOrderResolutionCommandScope &
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

export type ChangeProductionOrderResolutionResult = Readonly<{
  locationId: string;
  orderId: string;
  action: 'resolve_without_production' | 'restore';
  resolutionState: 'open' | 'resolved_without_production';
  transitionedAt: string;
  version: number;
  replayed: boolean;
}>;

export type RestoredProductionOrderSourceProjection = Readonly<{
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

export type LockedProductionOrderResolution = Readonly<{
  orderId: string;
  locationId: string;
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

export type ChangeProductionOrderResolutionInput = Readonly<{
  locationId: string;
  orderId: string;
  actorId: string;
  expectedVersion: number;
  lifecycle: ProductionOrderResolutionLifecycleDecision;
  reason: string;
  note: string | null;
  clearPendingPlacement: boolean;
  restoredSourceProjection: RestoredProductionOrderSourceProjection | null;
  now: Date;
}>;
