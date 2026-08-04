import type { ReconcileProductionBatchProgressFailure } from './reconcile-production-batch-progress.failure.ts';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  WorkEventInput,
} from '../../../foundations/language/commands/production-command.model.ts';
import type {
  ProductionBatchLifecycleDecision,
  ProductionOrderStageAttemptMutation,
  ProductionTerminalLifecycleDecisions,
} from '../../../foundations/language/execution/production-lifecycle.model.ts';
import type { UnitOfWork } from '@pressly/kernel';
import type {
  ProductionBatchProgressReconciledResult,
  ProductionBatchProgressReconciliationResult,
  ReconcileProductionBatchProgressCommand,
  ReconciliationContext,
  ReconciliationProjection,
} from './reconcile-production-batch-progress.model.ts';

export type ReconcileProductionBatchProgress = (
  command: ReconcileProductionBatchProgressCommand,
) => Promise<
  Result<
    ProductionBatchProgressReconciliationResult,
    ReconcileProductionBatchProgressFailure
  >
>;

export type ReconcileProductionBatchProgressRepository = UnitOfWork<
  Readonly<{
    findWorkEvent: FindWorkEvent;
    loadContext: (
      locationId: string,
      productionRunId: string,
      productionBatchId: string,
    ) => Promise<ReconciliationContext | null>;
    reconcile: (input: {
      locationId: string;
      context: ReconciliationContext;
      projection: ReconciliationProjection;
      stageLifecycles: readonly Readonly<{
        stageRunId: string;
        lifecycle: Readonly<{
          from: 'planned' | 'started';
          state: 'started' | 'completed';
        }>;
      }>[];
      batchLifecycle: ProductionBatchLifecycleDecision | null;
      attemptLifecycles: readonly ProductionOrderStageAttemptMutation[];
      machineIds: readonly string[];
      terminalLifecycle: ProductionTerminalLifecycleDecisions | null;
      actorId: string;
      now: Date;
    }) => Promise<ProductionBatchProgressReconciledResult | null>;
    appendWorkEvent: (event: WorkEventInput) => Promise<void>;
  }>
>;
