import { invariantViolationError } from '@pressly/errors/factories';
import type {
  ProductionBatchLifecycleDecision,
  ProductionFloorProgressTarget,
  ProductionOrderStageAttemptMutation,
  ProductionOrderTerminalExecutionMutation,
  ProductionTerminalLifecycleDecisions,
} from '../../../model/public.ts';
import {
  makeReconciliationConfirmationRequired,
  matchesReconciliationConfirmation,
} from './confirmation.ts';
import type {
  ReconcileBatchProgressCommand,
  ReconcileBatchProgressDecision,
  ReconcileBatchProgressExpectedFailure,
  ReconcileBatchProgressPolicy,
  ReconciliationContext,
  ReconciliationProjection,
  ReconciliationStage,
} from './types.ts';

export const reconcileBatchProgressOperationId =
  'production.reconcile-batch-progress.v1' as const;

const reject = (
  kind: 'conflict' | 'not_found',
  code: string,
  message: string,
): ReconcileBatchProgressDecision => ({
  kind: 'reject',
  failure: { kind, code, message, safeMessage: message },
});

const policyRejection = (
  failure: Readonly<{ code: string; message: string }>,
): ReconcileBatchProgressDecision =>
  reject('conflict', failure.code.toLowerCase(), failure.message);

const activeStageForTarget = (
  target: ProductionFloorProgressTarget,
): ReconciliationStage['stage'] | null => {
  if (target === 'sorting_started') return 'sorting';
  if (target === 'washing_started') return 'washing';
  if (target === 'drying_started') return 'drying';
  if (target === 'folding_packaging_started') return 'folding_packaging';
  return null;
};

const batchEvent = (
  state: ReconciliationProjection['batchStatus'],
):
  | 'reconcile_to_sorting'
  | 'reconcile_to_washing'
  | 'reconcile_to_drying'
  | 'reconcile_to_folding_packaging'
  | 'reconcile_to_finished' => {
  if (state === 'sorting') return 'reconcile_to_sorting';
  if (state === 'washing') return 'reconcile_to_washing';
  if (state === 'drying') return 'reconcile_to_drying';
  if (state === 'folding_packaging') return 'reconcile_to_folding_packaging';
  return 'reconcile_to_finished';
};

const exactStageVersionsMatch = (
  actual: readonly ReconciliationStage[],
  expected: readonly Readonly<{ stageRunId: string; version: number }>[],
): boolean => {
  const byId = new Map(
    expected.map((stage) => [stage.stageRunId, stage.version]),
  );
  return (
    byId.size === actual.length &&
    actual.every((stage) => byId.get(stage.stageRunId) === stage.version)
  );
};

const validateScope = (
  command: ReconcileBatchProgressCommand,
  context: ReconciliationContext | null,
): ReconcileBatchProgressExpectedFailure | null => {
  if (context === null)
    return {
      kind: 'not_found',
      code: 'production_batch_not_found',
      message: 'The production batch was not found in this run.',
      safeMessage: 'The production batch was not found in this run.',
    };
  if (context.run.queueVersion !== command.expectedQueueVersion)
    return {
      kind: 'conflict',
      code: 'production_queue_version_conflict',
      message:
        'The production queue changed before floor progress was recorded.',
      safeMessage:
        'The production queue changed before floor progress was recorded.',
    };
  if (context.batch.version !== command.expectedBatchVersion)
    return {
      kind: 'conflict',
      code: 'production_batch_version_conflict',
      message:
        'The production batch changed before floor progress was recorded.',
      safeMessage:
        'The production batch changed before floor progress was recorded.',
    };
  if (!exactStageVersionsMatch(context.stages, command.expectedStageVersions))
    return {
      kind: 'conflict',
      code: 'stage_run_version_conflict',
      message: 'A production stage changed before floor progress was recorded.',
      safeMessage:
        'A production stage changed before floor progress was recorded.',
    };
  return null;
};

export const decideReconcileBatchProgress = (input: {
  command: ReconcileBatchProgressCommand;
  context: ReconciliationContext | null;
  policy: ReconcileBatchProgressPolicy;
  now: Date;
}): ReconcileBatchProgressDecision => {
  const scopeFailure = validateScope(input.command, input.context);
  if (scopeFailure !== null) return { kind: 'reject', failure: scopeFailure };
  const context = input.context;
  if (context === null)
    throw invariantViolationError({
      code: 'reconciliation_context_narrowing_failed',
      message: 'Validated reconciliation context is unexpectedly absent.',
    });

  for (const order of context.activeOrders) {
    const access = input.policy.evaluateProductionOrderOperationalAccess({
      resolutionState: order.resolutionState,
    });
    if (access.tag === 'err') return policyRejection(access.error);
  }

  const activeStage = activeStageForTarget(input.command.target);
  const selectedMachines = context.machines.filter((machine) =>
    input.command.machineIds.includes(machine.id),
  );
  if (selectedMachines.length !== input.command.machineIds.length)
    return reject(
      'not_found',
      'machine_not_found',
      'One or more requested machines are not available.',
    );

  let machineIds: readonly string[] = [];
  if (activeStage === 'washing' || activeStage === 'drying') {
    const machines = input.policy.evaluateMachineAssignment({
      stageKind: activeStage,
      batchWeightLbs: context.batch.derivedWeightLbs,
      machines: selectedMachines,
    });
    if (machines.tag === 'err') return policyRejection(machines.error);
    machineIds = machines.value.machineIds;
  }

  const reconciliation = input.policy.evaluateFloorProgressReconciliation({
    runStatus: context.run.status,
    batchStatus: context.batch.status,
    stages: context.stages.map((stage) => ({
      stageRunId: stage.stageRunId,
      stage: stage.stage,
      status: stage.status,
    })),
    target: input.command.target,
    sameKindAlreadyActive:
      activeStage !== null && context.activeStageKinds.includes(activeStage),
    assignedMachineIds: machineIds,
    overlappingMachineIds: selectedMachines
      .filter((machine) => machine.overlaps)
      .map((machine) => machine.id),
  });
  if (reconciliation.tag === 'err')
    return policyRejection(reconciliation.error);
  const projection: ReconciliationProjection = reconciliation.value;
  const confirmationInput = {
    locationId: input.command.locationId,
    actorId: input.command.actorId,
    context,
    projection,
    reason: input.command.reason,
    note: input.command.note,
    machineIds,
  };
  const confirmationRequired =
    makeReconciliationConfirmationRequired(confirmationInput);
  if (input.command.confirmation === null)
    return { kind: 'preview', result: confirmationRequired };
  if (
    !matchesReconciliationConfirmation({
      ...confirmationInput,
      confirmation: input.command.confirmation,
    })
  )
    return reject(
      'conflict',
      'progress_reconciliation_confirmation_stale',
      'The floor-progress confirmation is no longer current.',
    );

  const stageLifecycles: {
    stageRunId: string;
    lifecycle: Readonly<{
      from: 'planned' | 'started';
      state: 'started' | 'completed';
    }>;
  }[] = [];
  const attemptLifecycles: ProductionOrderStageAttemptMutation[] = [];
  for (const transition of projection.stages) {
    if (transition.currentStatus === transition.nextStatus) continue;
    const current = context.stages.find(
      (stage) => stage.stageRunId === transition.stageRunId,
    );
    if (current === undefined)
      throw invariantViolationError({
        code: 'batch_stage_graph_invalid',
        message: 'The production batch stage graph is incomplete.',
        safeMessage: 'The production batch stage graph is incomplete.',
      });
    const stageDecision = input.policy.evaluateStageTransition(
      {
        state: transition.currentStatus,
        plannedStartAt: current.plannedStartAt,
        plannedEndAt: current.plannedEndAt,
        actualStartAt: current.actualStartAt,
      },
      {
        type:
          transition.nextStatus === 'started'
            ? 'reconcile_start'
            : 'reconcile_complete',
      },
      {
        now: input.now,
        productionRunStarted: context.run.status === 'started',
        previousStageCompleted: true,
        sameKindAlreadyActive: context.activeStageKinds.includes(
          transition.stage,
        ),
        machinesRequired:
          transition.stage === 'washing' || transition.stage === 'drying',
        assignedMachineIds:
          transition.nextStatus === 'started' ? machineIds : [],
        overlappingMachineIds: selectedMachines
          .filter((machine) => machine.overlaps)
          .map((machine) => machine.id),
      },
    );
    if (
      stageDecision.tag === 'err' ||
      stageDecision.value.status !== 'allowed' ||
      stageDecision.value.from === 'completed' ||
      stageDecision.value.state === 'planned'
    )
      return stageDecision.tag === 'err'
        ? policyRejection(stageDecision.error)
        : reject(
            'conflict',
            'stage_policy_invalid_result',
            'The production stage policy returned an invalid reconciliation transition.',
          );
    stageLifecycles.push({
      stageRunId: transition.stageRunId,
      lifecycle: {
        from: stageDecision.value.from,
        state: stageDecision.value.state,
      },
    });

    if (stageDecision.value.state !== 'completed') continue;
    const attempts = context.attempts.filter(
      (attempt) =>
        attempt.stageRunId === transition.stageRunId &&
        attempt.status === 'assigned',
    );
    if (attempts.length === 0)
      return reject(
        'conflict',
        'production_stage_attempts_missing',
        'A completed production stage has no assigned order attempts.',
      );
    for (const attempt of attempts) {
      const decision =
        input.policy.evaluateProductionOrderStageAttemptTransition({
          state: attempt.status,
          event: 'complete_with_stage',
        });
      if (decision.tag === 'err') return policyRejection(decision.error);
      attemptLifecycles.push({
        attemptId: attempt.id,
        stageRunId: attempt.stageRunId,
        lifecycle: decision.value,
      });
    }
  }

  let batchLifecycle: ProductionBatchLifecycleDecision | null = null;
  if (projection.batchStatus !== context.batch.status) {
    const decision = input.policy.evaluateProductionBatchTransition({
      state: context.batch.status,
      event: batchEvent(projection.batchStatus),
    });
    if (decision.tag === 'err') return policyRejection(decision.error);
    batchLifecycle = decision.value;
  }

  let terminalLifecycle: ProductionTerminalLifecycleDecisions | null = null;
  if (projection.batchStatus === 'finished') {
    const orders: ProductionOrderTerminalExecutionMutation[] = [];
    for (const order of context.activeOrders) {
      const resolved = input.policy.resolveProductionOrderExecutionState({
        executionState: order.executionStatus,
        operationalStatus: order.status,
      });
      if (resolved.tag === 'err') return policyRejection(resolved.error);
      const decision = input.policy.evaluateProductionOrderExecutionTransition({
        state: resolved.value,
        event: 'finish_with_batch',
      });
      if (decision.tag === 'err') return policyRejection(decision.error);
      if (
        decision.value.from !== 'scheduled' ||
        decision.value.state !== 'finished'
      )
        return reject(
          'conflict',
          'production_order_execution_transition_invalid',
          'The production order cannot be finished with this batch.',
        );
      orders.push({
        productionOrderId: order.id,
        persistedState:
          order.executionStatus === 'unassigned' ||
          order.executionStatus === 'scheduled' ||
          order.executionStatus === 'finished'
            ? order.executionStatus
            : resolved.value,
        expectedVersion: order.version,
        lifecycle: {
          from: decision.value.from,
          state: decision.value.state,
        },
      });
    }
    if (orders.length === 0)
      return reject(
        'conflict',
        'production_batch_orders_missing',
        'The production batch has no active orders.',
      );
    const run = input.policy.evaluateProductionRunTransition({
      state: context.run.status,
      event: 'complete_final_batch',
    });
    const shift = input.policy.evaluateProductionShiftTransition({
      state: context.run.productionShiftStatus,
      event: 'close_after_execution',
    });
    if (
      run.tag === 'err' ||
      run.value.from !== 'started' ||
      run.value.state !== 'completed'
    )
      return reject(
        'conflict',
        'production_run_transition_invalid',
        'The production run cannot be completed.',
      );
    if (
      shift.tag === 'err' ||
      shift.value.from !== 'open' ||
      shift.value.state !== 'closed'
    )
      return reject(
        'conflict',
        'production_shift_transition_invalid',
        'The production shift cannot be closed.',
      );
    terminalLifecycle = { run: run.value, shift: shift.value, orders };
  }

  return {
    kind: 'commit',
    plan: {
      context,
      projection,
      confirmationRequired,
      stageLifecycles,
      batchLifecycle,
      attemptLifecycles,
      machineIds,
      terminalLifecycle,
      now: input.now,
    },
  };
};
