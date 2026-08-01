import type { OrderDemandPhase } from '../production-lifecycle/order-demand.port.ts';
import type { ProductionOrderExecutionState } from '../production-lifecycle/production-lifecycle.port.ts';
import type { PolicyDecision } from './policy-decision.port.ts';

type ProductionOperationalStatus =
  | 'release_pending'
  | 'intake_pending'
  | 'eligible'
  | 'ineligible'
  | 'scheduled'
  | 'finished';

export type ProductionAdmissionPolicyPort = Readonly<{
  deriveProductionOrderOperationalStatus: (input: {
    executionState: ProductionOrderExecutionState;
    admission: 'unreleased' | 'released' | 'withdrawn' | 'post_production';
    admissionOverride: 'released' | null;
    hasPositiveDemand: boolean;
    bagCount: number | null;
  }) => ProductionOperationalStatus;
  evaluateProductionAdmission: (input: {
    target: 'released' | 'source';
    sourceAdmissionState: 'unreleased' | 'released' | 'withdrawn';
    productionStatus: ProductionOperationalStatus;
    admissionOverride: 'released' | null;
    bagCount: number | null;
    selectedForShift: boolean;
    hasActivePlacement: boolean;
  }) =>
    | Readonly<{
        tag: 'ok';
        value: Readonly<{
          admissionOverride: 'released' | null;
          productionStatus: 'release_pending' | 'intake_pending' | 'eligible';
        }>;
      }>
    | Readonly<{
        tag: 'err';
        error: Readonly<{ code: string; message: string }>;
      }>;
  allowedProductionAdmissionActions: (input: {
    sourceAdmissionState: 'unreleased' | 'released' | 'withdrawn';
    productionStatus: ProductionOperationalStatus;
    admissionOverride: 'released' | null;
    bagCount: number | null;
    selectedForShift: boolean;
    hasActivePlacement: boolean;
  }) => readonly ('release' | 'return_to_source')[];
  evaluateDemandLifecycle: (input: {
    phase: OrderDemandPhase;
    productionStatus: ProductionOperationalStatus | null;
    currentBagCount: number | null;
    estimatedWeightLbs: number | null;
  }) => Readonly<{
    canonicalBagCount: number | null;
    production:
      | Readonly<{ action: 'none' }>
      | Readonly<{ action: 'preserve' }>
      | Readonly<{
          action: 'create' | 'update';
          status:
            | 'release_pending'
            | 'intake_pending'
            | 'eligible'
            | 'ineligible';
        }>;
  }>;
  evaluateIntakeAdmission: (input: {
    phase: OrderDemandPhase;
    derivedWeightLbs: number;
    bagCount: number | null;
  }) => PolicyDecision<Readonly<{ status: 'release_pending' | 'eligible' }>>;
}>;
