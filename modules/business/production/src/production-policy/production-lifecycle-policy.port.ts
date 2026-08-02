import type { Result } from '@pressly/kernel';
import type {
  ProductionBatchLifecycleDecision,
  ProductionOrderExecutionLifecycleDecision,
  ProductionOrderExecutionState,
  ProductionOrderResolutionGuardDecision,
  ProductionOrderResolutionLifecycleDecision,
  ProductionOrderStageAttemptLifecycleDecision,
  ProductionRunLifecycleDecision,
  ProductionShiftLifecycleDecision,
  ScheduleRevisionLifecycleDecision,
} from '../production-lifecycle/production-lifecycle.model.ts';
import type { ProductionPolicyRejection } from './production-policy.model.ts';

export type ProductionLifecyclePolicyPort = Readonly<{
  initialProductionShiftState: 'open';
  evaluateProductionShiftTransition: (input: {
    state: string;
    event: 'close_after_execution';
  }) => Result<ProductionShiftLifecycleDecision, ProductionPolicyRejection>;
  allowedProductionShiftEvents: (
    state: string,
  ) => readonly 'close_after_execution'[];
  initialScheduleRevisionState: 'draft';
  evaluateScheduleRevisionTransition: (input: {
    state: string;
    event: 'accept' | 'supersede' | 'reject';
  }) => Result<ScheduleRevisionLifecycleDecision, ProductionPolicyRejection>;
  allowedScheduleRevisionEvents: (
    state: string,
  ) => readonly ('accept' | 'supersede' | 'reject')[];
  initialProductionRunState: 'started';
  evaluateProductionRunTransition: (input: {
    state: string;
    event: 'complete_final_batch';
  }) => Result<ProductionRunLifecycleDecision, ProductionPolicyRejection>;
  allowedProductionRunEvents: (
    state: string,
  ) => readonly 'complete_final_batch'[];
  initialProductionBatchState: 'queued';
  evaluateProductionBatchTransition: (input: {
    state: string;
    event:
      | 'start_sorting'
      | 'start_washing'
      | 'start_drying'
      | 'start_folding_packaging'
      | 'finish'
      | 'reconcile_to_sorting'
      | 'reconcile_to_washing'
      | 'reconcile_to_drying'
      | 'reconcile_to_folding_packaging'
      | 'reconcile_to_finished';
  }) => Result<ProductionBatchLifecycleDecision, ProductionPolicyRejection>;
  initialProductionOrderExecutionState: 'unassigned';
  resolveProductionOrderExecutionState: (input: {
    executionState: string | null | undefined;
    operationalStatus: string;
  }) => Result<ProductionOrderExecutionState, ProductionPolicyRejection>;
  evaluateProductionOrderExecutionTransition: (input: {
    state: string;
    event: 'schedule_or_place' | 'finish_with_batch';
  }) => Result<
    ProductionOrderExecutionLifecycleDecision,
    ProductionPolicyRejection
  >;
  initialProductionOrderResolutionState: 'open';
  evaluateProductionOrderResolutionTransition: (input: {
    state: string;
    event: 'resolve_without_production' | 'restore';
  }) => Result<
    ProductionOrderResolutionLifecycleDecision,
    ProductionPolicyRejection
  >;
  evaluateProductionOrderOperationalAccess: (input: {
    resolutionState: string;
  }) => Result<
    Readonly<{ resolutionState: 'open' }>,
    ProductionPolicyRejection
  >;
  evaluateProductionOrderResolutionGuard: (input: {
    executionState: ProductionOrderExecutionState;
    hasShiftSelection: boolean;
    hasBatchMembership: boolean;
    hasStageAttempt: boolean;
    hasRoute: boolean;
    hasIntake: boolean;
    hasManualAdmission: boolean;
    isPriority: boolean;
    hasPendingPlacement: boolean;
  }) => ProductionOrderResolutionGuardDecision;
  initialProductionOrderStageAttemptState: 'assigned';
  evaluateProductionOrderStageAttemptTransition: (input: {
    state: string;
    event: 'complete_with_stage' | 'release_for_route';
  }) => Result<
    ProductionOrderStageAttemptLifecycleDecision,
    ProductionPolicyRejection
  >;
  initialProductionStageState: 'planned';
}>;
