import type { Result } from '@pressly/kernel';
import type { OrderDemandPhase } from '../production-lifecycle/order-demand.model.ts';
import type { ProductionOrderExecutionState } from '../production-lifecycle/production-lifecycle.model.ts';
import type { ProductionPolicyRejection } from './production-policy.model.ts';

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
  }) => Result<
    Readonly<{
      admissionOverride: 'released' | null;
      productionStatus: 'release_pending' | 'intake_pending' | 'eligible';
    }>,
    ProductionPolicyRejection
  >;
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
  }) => Result<
    Readonly<{ status: 'release_pending' | 'eligible' }>,
    ProductionPolicyRejection
  >;
}>;
