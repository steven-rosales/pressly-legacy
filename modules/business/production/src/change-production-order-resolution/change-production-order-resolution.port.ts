import type {
  ChangeProductionOrderResolutionCommand,
  ChangeProductionOrderResolutionResult,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  WorkEventInput,
} from '../command-execution/production-command.port.ts';
import type { ProductionOrderResolutionLifecycleDecision } from '../production-lifecycle/production-lifecycle.model.ts';
import type { Transactional } from '../persistence/production-transaction.port.ts';

export type ChangeProductionOrderResolution = (
  command: ChangeProductionOrderResolutionCommand &
    Readonly<{
      actorId: string;
      sourceStatePrecondition?: Readonly<{
        commercialState: 'open';
        admissionState: 'unreleased';
      }>;
    }>,
) => Promise<Result<ChangeProductionOrderResolutionResult, AppError>>;

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

export type ProductionOrderResolutionCandidate = Readonly<{
  orderId: string;
  locationId: string;
  productionVersion: number;
  resolutionState: string;
  sourceAdmissionState: 'unreleased' | 'released' | 'withdrawn';
  sourceCommercialState: 'open' | 'completed' | 'canceled';
}>;

export type ChangeProductionOrderResolutionRepository = Transactional<
  Readonly<{
    findWorkEvent: FindWorkEvent;
    findOrderByFulfillment: (
      locationId: string,
      fulfillmentId: string,
    ) => Promise<ProductionOrderResolutionCandidate | null>;
    lockLocationScheduling: (locationId: string) => Promise<void>;
    lockOrder: (
      locationId: string,
      orderId: string,
    ) => Promise<LockedProductionOrderResolution | null>;
    changeResolution: (input: {
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
    }) => Promise<ChangeProductionOrderResolutionResult | null>;
    appendWorkEvent: (event: WorkEventInput) => Promise<void>;
  }>
>;
