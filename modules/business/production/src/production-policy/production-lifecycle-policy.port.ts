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
} from '../production-lifecycle/production-lifecycle.port.ts';
import type { PolicyDecision } from './policy-decision.port.ts';

export type ProductionLifecyclePolicyPort = Readonly<{
  initialProductionShiftState: 'open';
  evaluateProductionShiftTransition: (input: {
    state: string;
    event: 'close_after_execution';
  }) => PolicyDecision<ProductionShiftLifecycleDecision>;
  allowedProductionShiftEvents: (
    state: string,
  ) => readonly 'close_after_execution'[];
  initialScheduleRevisionState: 'draft';
  evaluateScheduleRevisionTransition: (input: {
    state: string;
    event: 'accept' | 'supersede' | 'reject';
  }) => PolicyDecision<ScheduleRevisionLifecycleDecision>;
  allowedScheduleRevisionEvents: (
    state: string,
  ) => readonly ('accept' | 'supersede' | 'reject')[];
  initialProductionRunState: 'started';
  evaluateProductionRunTransition: (input: {
    state: string;
    event: 'complete_final_batch';
  }) => PolicyDecision<ProductionRunLifecycleDecision>;
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
  }) => PolicyDecision<ProductionBatchLifecycleDecision>;
  initialProductionOrderExecutionState: 'unassigned';
  resolveProductionOrderExecutionState: (input: {
    executionState: string | null | undefined;
    operationalStatus: string;
  }) => PolicyDecision<ProductionOrderExecutionState>;
  evaluateProductionOrderExecutionTransition: (input: {
    state: string;
    event: 'schedule_or_place' | 'finish_with_batch';
  }) => PolicyDecision<ProductionOrderExecutionLifecycleDecision>;
  initialProductionOrderResolutionState: 'open';
  evaluateProductionOrderResolutionTransition: (input: {
    state: string;
    event: 'resolve_without_production' | 'restore';
  }) => PolicyDecision<ProductionOrderResolutionLifecycleDecision>;
  evaluateProductionOrderOperationalAccess: (input: {
    resolutionState: string;
  }) => PolicyDecision<Readonly<{ resolutionState: 'open' }>>;
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
  }) => PolicyDecision<ProductionOrderStageAttemptLifecycleDecision>;
  initialProductionStageState: 'planned';
}>;
