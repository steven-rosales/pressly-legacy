import type { ProductionRules } from '../../../model/public.ts';

export type ChangeAdmissionCommand = Readonly<{
  locationId: string;
  productionOrderId: string;
  actorId: string;
  target: 'released' | 'source';
  expectedVersion: number;
  idempotencyKey: string;
}>;

export type ChangeAdmissionResult = Readonly<{
  locationId: string;
  orderId: string;
  admissionOverride: 'released' | null;
  status:
    | 'release_pending'
    | 'intake_pending'
    | 'eligible'
    | 'ineligible'
    | 'scheduled'
    | 'finished';
  version: number;
  replayed: boolean;
}>;

export type ChangeAdmissionExpectedFailure = Readonly<{
  kind: 'conflict' | 'not_found';
  code: string;
  message: string;
  safeMessage: string;
}>;

export type ChangeAdmissionFacts = Readonly<{
  productionOrderId: string;
  sourceAdmissionState: 'unreleased' | 'released' | 'withdrawn';
  productionStatus: ChangeAdmissionResult['status'];
  productionVersion: number;
  executionStatus: string;
  derivedWeightLbs: number;
  admissionOverride: 'released' | null;
  bagCount: number | null;
  selectedForShift: boolean;
  hasActivePlacement: boolean;
  resolutionState: string;
}>;

export type ChangeAdmissionPolicy = Pick<
  ProductionRules,
  | 'evaluateProductionOrderOperationalAccess'
  | 'evaluateProductionAdmission'
  | 'resolveProductionOrderExecutionState'
  | 'deriveProductionOrderOperationalStatus'
>;

export type ChangeAdmissionDecision =
  | Readonly<{
      kind: 'commit';
      admissionOverride: 'released' | null;
      nextStatus: 'release_pending' | 'intake_pending' | 'eligible';
    }>
  | Readonly<{
      kind: 'reject';
      failure: ChangeAdmissionExpectedFailure;
    }>;
