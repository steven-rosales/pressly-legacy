import type {
  AdvanceStageAttemptMutation,
  AdvanceStageBatchLifecycle,
  AdvanceStageCommand,
  AdvanceStageCommitPlan,
  AdvanceStageCompletionTiming,
  AdvanceStageDecision,
  AdvanceStageEarlyCompletionAudit,
  AdvanceStageEarlyStartAudit,
  AdvanceStageExpectedFailure,
  AdvanceStageFacts,
  AdvanceStageInvariantFailure,
  AdvanceStageOrderTerminalMutation,
  AdvanceStagePolicy,
  AdvanceStageStartTiming,
  AdvanceStageTerminalLifecycle,
  DecideAdvanceStageInput,
} from './types.ts';

export const advanceStageOperationId = 'production.advance-stage.v1' as const;

type RejectDecision = Extract<AdvanceStageDecision, { kind: 'reject' }>;
type ConfirmationDecision = Extract<
  AdvanceStageDecision,
  { kind: 'confirmation' }
>;

type StageLifecycleReady = Readonly<{
  kind: 'ready';
  stageLifecycle: AdvanceStageCommitPlan['stageLifecycle'];
  audit: AdvanceStageCommitPlan['audit'];
}>;

type BatchLifecycleReady = Readonly<{
  kind: 'ready';
  batchLifecycle: AdvanceStageBatchLifecycle | null;
}>;

type AttemptLifecyclesReady = Readonly<{
  kind: 'ready';
  attemptLifecycles: readonly AdvanceStageAttemptMutation[];
}>;

type TerminalLifecycleReady = Readonly<{
  kind: 'ready';
  terminalLifecycle: AdvanceStageTerminalLifecycle | null;
}>;

const isCompletedRunLifecycle = (
  value: Readonly<{ from: string; state: string }>,
): value is AdvanceStageTerminalLifecycle['run'] =>
  value.from === 'started' && value.state === 'completed';

const isClosedShiftLifecycle = (
  value: Readonly<{ from: string; state: string }>,
): value is AdvanceStageTerminalLifecycle['shift'] =>
  value.from === 'open' && value.state === 'closed';

const expectedFailure = (
  kind: AdvanceStageExpectedFailure['kind'],
  code: string,
  message: string,
  safeMessage = message,
): RejectDecision => ({
  kind: 'reject',
  rejection: {
    kind: 'expected',
    failure: { kind, code, message, safeMessage },
  },
});

const conflict = (code: string, message: string): RejectDecision =>
  expectedFailure('conflict', code, message);

const invariant = (
  code: string,
  message: string,
  safeMessage = message,
): RejectDecision => ({
  kind: 'reject',
  rejection: {
    kind: 'invariant',
    failure: {
      code,
      message,
      safeMessage,
    } satisfies AdvanceStageInvariantFailure,
  },
});

const batchEventForStage = (input: {
  stage: AdvanceStageFacts['stage']['stage'];
  nextState: AdvanceStageCommitPlan['stageLifecycle']['state'];
}):
  | 'start_sorting'
  | 'start_washing'
  | 'start_drying'
  | 'start_folding_packaging'
  | 'finish'
  | null => {
  if (input.nextState === 'completed')
    return input.stage === 'folding_packaging' ? 'finish' : null;
  if (input.stage === 'sorting') return 'start_sorting';
  if (input.stage === 'washing') return 'start_washing';
  if (input.stage === 'drying') return 'start_drying';
  return 'start_folding_packaging';
};

const earlyStartAudit = (input: {
  actorId: string;
  confirmation: NonNullable<AdvanceStageCommand['confirmation']>;
  timing: AdvanceStageStartTiming;
  now: Date;
}): AdvanceStageEarlyStartAudit => ({
  actorId: input.actorId,
  confirmationHash: input.confirmation.confirmationHash,
  confirmationObservedAt: input.confirmation.observedAt,
  confirmedAt: input.now.toISOString(),
  plannedStartAt: input.timing.plannedStartAt,
  plannedEndAt: input.timing.plannedEndAt,
  remainingMilliseconds: input.timing.remainingMilliseconds,
});

const earlyCompletionAudit = (input: {
  actorId: string;
  confirmation: NonNullable<AdvanceStageCommand['confirmation']>;
  timing: AdvanceStageCompletionTiming;
  now: Date;
}): AdvanceStageEarlyCompletionAudit => ({
  actorId: input.actorId,
  confirmationHash: input.confirmation.confirmationHash,
  confirmationObservedAt: input.confirmation.observedAt,
  confirmedAt: input.now.toISOString(),
  actualStartAt: input.timing.actualStartAt,
  plannedEndAt: input.timing.plannedEndAt,
  completionBoundaryAt: input.timing.completionBoundaryAt,
  plannedDurationMilliseconds: input.timing.plannedDurationMilliseconds,
  elapsedMilliseconds: input.timing.elapsedMilliseconds,
  remainingMilliseconds: input.timing.remainingMilliseconds,
});

const decideStageLifecycle = (input: {
  facts: AdvanceStageFacts;
  command: AdvanceStageCommand;
  now: Date;
  policy: AdvanceStagePolicy;
}): StageLifecycleReady | RejectDecision | ConfirmationDecision => {
  const assigned = input.facts.machines.filter((machine) =>
    input.facts.stage.machineIds.includes(machine.id),
  );
  const machinesRequired = ['washing', 'drying'].includes(
    input.facts.stage.stage,
  );
  const decision = input.policy.evaluateStageTransition(
    {
      state: input.facts.stage.status,
      plannedStartAt: new Date(input.facts.stage.plannedStartAt),
      plannedEndAt: new Date(input.facts.stage.plannedEndAt),
      actualStartAt:
        input.facts.stage.actualStartAt === null
          ? null
          : new Date(input.facts.stage.actualStartAt),
    },
    { type: input.command.transition },
    {
      now: input.now,
      productionRunStarted: input.facts.productionRunStarted,
      previousStageCompleted: input.facts.previousStageCompleted,
      sameKindAlreadyActive: input.facts.sameKindAlreadyActive,
      machinesRequired,
      assignedMachineIds: assigned.map((machine) => machine.id),
      overlappingMachineIds: assigned
        .filter((machine) => machine.overlaps)
        .map((machine) => machine.id),
    },
  );
  if (decision.tag === 'err')
    return conflict(decision.error.code.toLowerCase(), decision.error.message);

  if (input.command.transition === 'start' && machinesRequired) {
    const assignment = input.policy.evaluateMachineAssignment({
      stageKind: input.facts.stage.stage,
      batchWeightLbs: input.facts.batchWeightLbs,
      machines: assigned,
    });
    if (assignment.tag === 'err')
      return conflict(
        assignment.error.code.toLowerCase(),
        assignment.error.message,
      );
  }

  if (decision.value.status === 'confirmation_required') {
    if (
      decision.value.action === 'start' &&
      input.command.transition === 'start'
    ) {
      const confirmationRequired =
        input.policy.makeStageStartConfirmationRequired({
          locationId: input.command.locationId,
          stageRunId: input.command.stageRunId,
          actorId: input.command.actorId,
          expectedVersion: input.command.expectedVersion,
          code: decision.value.code,
          message: decision.value.message,
          timing: decision.value.timing,
        });
      if (input.command.confirmation === undefined)
        return { kind: 'confirmation', result: confirmationRequired };
      if (
        !input.policy.matchesStageStartConfirmation({
          locationId: input.command.locationId,
          stageRunId: input.command.stageRunId,
          actorId: input.command.actorId,
          expectedVersion: input.command.expectedVersion,
          timing: decision.value.timing,
          now: input.now,
          confirmation: input.command.confirmation,
        })
      )
        return conflict(
          'stage_start_confirmation_stale',
          'The early-start confirmation is no longer current.',
        );
      if (input.facts.stage.status !== 'planned')
        return invariant(
          'stage_policy_invalid_result',
          'The production stage policy returned an invalid transition.',
        );

      return {
        kind: 'ready',
        stageLifecycle: { from: 'planned', state: 'started' },
        audit: {
          earlyStart: earlyStartAudit({
            actorId: input.command.actorId,
            confirmation: input.command.confirmation,
            timing: decision.value.timing,
            now: input.now,
          }),
        },
      };
    }

    if (
      decision.value.action === 'complete' &&
      input.command.transition === 'complete'
    ) {
      const confirmationRequired =
        input.policy.makeStageCompletionConfirmationRequired({
          locationId: input.command.locationId,
          stageRunId: input.command.stageRunId,
          actorId: input.command.actorId,
          expectedVersion: input.command.expectedVersion,
          code: decision.value.code,
          message: decision.value.message,
          timing: decision.value.timing,
        });
      if (input.command.confirmation === undefined)
        return { kind: 'confirmation', result: confirmationRequired };
      if (
        !input.policy.matchesStageCompletionConfirmation({
          locationId: input.command.locationId,
          stageRunId: input.command.stageRunId,
          actorId: input.command.actorId,
          expectedVersion: input.command.expectedVersion,
          timing: decision.value.timing,
          now: input.now,
          confirmation: input.command.confirmation,
        })
      )
        return conflict(
          'stage_completion_confirmation_stale',
          'The early-completion confirmation is no longer current.',
        );
      if (input.facts.stage.status !== 'started')
        return invariant(
          'stage_policy_invalid_result',
          'The production stage policy returned an invalid transition.',
        );

      return {
        kind: 'ready',
        stageLifecycle: { from: 'started', state: 'completed' },
        audit: {
          earlyCompletion: earlyCompletionAudit({
            actorId: input.command.actorId,
            confirmation: input.command.confirmation,
            timing: decision.value.timing,
            now: input.now,
          }),
        },
      };
    }

    return invariant(
      'stage_policy_invalid_result',
      'The production stage policy returned an invalid confirmation.',
    );
  }

  if (decision.value.from === 'completed' || decision.value.state === 'planned')
    return invariant(
      'stage_policy_invalid_result',
      'The production stage policy returned an invalid transition.',
    );

  return {
    kind: 'ready',
    stageLifecycle: {
      from: decision.value.from,
      state: decision.value.state,
    },
    audit: {},
  };
};

const decideBatchLifecycle = (input: {
  facts: AdvanceStageFacts;
  stageLifecycle: AdvanceStageCommitPlan['stageLifecycle'];
  policy: AdvanceStagePolicy;
}): BatchLifecycleReady | RejectDecision => {
  const batchEvent = batchEventForStage({
    stage: input.facts.stage.stage,
    nextState: input.stageLifecycle.state,
  });
  if (batchEvent !== null) {
    const decision = input.policy.evaluateProductionBatchTransition({
      state: input.facts.batch.status,
      event: batchEvent,
    });
    return decision.tag === 'err'
      ? conflict(decision.error.code.toLowerCase(), decision.error.message)
      : { kind: 'ready', batchLifecycle: decision.value };
  }
  if (input.facts.batch.status !== input.facts.stage.stage)
    return invariant(
      'production_batch_state_inconsistent',
      'The production batch state does not match its active stage.',
    );
  return { kind: 'ready', batchLifecycle: null };
};

const decideAttemptLifecycles = (input: {
  facts: AdvanceStageFacts;
  stageLifecycle: AdvanceStageCommitPlan['stageLifecycle'];
  policy: AdvanceStagePolicy;
}): AttemptLifecyclesReady | RejectDecision => {
  if (input.stageLifecycle.state !== 'completed')
    return { kind: 'ready', attemptLifecycles: [] };

  const attemptLifecycles: AdvanceStageAttemptMutation[] = [];
  for (const attempt of input.facts.attempts) {
    if (attempt.status !== 'assigned') continue;
    const decision = input.policy.evaluateProductionOrderStageAttemptTransition(
      {
        state: attempt.status,
        event: 'complete_with_stage',
      },
    );
    if (decision.tag === 'err')
      return conflict(
        decision.error.code.toLowerCase(),
        decision.error.message,
      );
    attemptLifecycles.push({
      attemptId: attempt.id,
      stageRunId: input.facts.stage.id,
      lifecycle: decision.value,
    });
  }
  return attemptLifecycles.length === 0
    ? conflict(
        'production_stage_attempts_missing',
        'The production stage has no assigned order attempts.',
      )
    : { kind: 'ready', attemptLifecycles };
};

const decideTerminalLifecycle = (input: {
  facts: AdvanceStageFacts;
  stageLifecycle: AdvanceStageCommitPlan['stageLifecycle'];
  policy: AdvanceStagePolicy;
}): TerminalLifecycleReady | RejectDecision => {
  if (
    input.stageLifecycle.state !== 'completed' ||
    input.facts.stage.stage !== 'folding_packaging'
  )
    return { kind: 'ready', terminalLifecycle: null };

  const orders: AdvanceStageOrderTerminalMutation[] = [];
  for (const order of input.facts.activeOrders) {
    const resolved = input.policy.resolveProductionOrderExecutionState({
      executionState: order.executionStatus,
      operationalStatus: order.status,
    });
    if (resolved.tag === 'err')
      return conflict(
        resolved.error.code.toLowerCase(),
        resolved.error.message,
      );
    const transition = input.policy.evaluateProductionOrderExecutionTransition({
      state: resolved.value,
      event: 'finish_with_batch',
    });
    if (transition.tag === 'err')
      return conflict(
        transition.error.code.toLowerCase(),
        transition.error.message,
      );
    if (
      transition.value.from !== 'scheduled' ||
      transition.value.state !== 'finished'
    )
      return conflict(
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
      lifecycle: { from: 'scheduled', state: 'finished' },
    });
  }
  if (orders.length === 0)
    return conflict(
      'production_batch_orders_missing',
      'The production batch has no active orders.',
    );

  const run = input.policy.evaluateProductionRunTransition({
    state: input.facts.productionRunStatus,
    event: 'complete_final_batch',
  });
  const shift = input.policy.evaluateProductionShiftTransition({
    state: input.facts.productionShiftStatus,
    event: 'close_after_execution',
  });
  if (run.tag === 'err' || !isCompletedRunLifecycle(run.value))
    return conflict(
      'production_run_transition_invalid',
      'The production run cannot be completed.',
    );
  if (shift.tag === 'err' || !isClosedShiftLifecycle(shift.value))
    return conflict(
      'production_shift_transition_invalid',
      'The production shift cannot be closed.',
    );

  return {
    kind: 'ready',
    terminalLifecycle: {
      run: run.value,
      shift: shift.value,
      orders,
    },
  };
};

export const decideAdvanceStage = (
  input: DecideAdvanceStageInput,
): AdvanceStageDecision => {
  if (input.facts === null)
    return expectedFailure(
      'not_found',
      'stage_run_not_found',
      'The production stage was not found.',
    );
  if (input.facts.stage.version !== input.command.expectedVersion)
    return conflict(
      'stage_run_version_conflict',
      'The production stage changed before the command.',
    );

  for (const order of input.facts.activeOrders) {
    const access = input.policy.evaluateProductionOrderOperationalAccess({
      resolutionState: order.resolutionState,
    });
    if (access.tag === 'err')
      return conflict(access.error.code.toLowerCase(), access.error.message);
  }

  const stage = decideStageLifecycle({
    facts: input.facts,
    command: input.command,
    now: input.now,
    policy: input.policy,
  });
  if (stage.kind !== 'ready') return stage;
  const batch = decideBatchLifecycle({
    facts: input.facts,
    stageLifecycle: stage.stageLifecycle,
    policy: input.policy,
  });
  if (batch.kind !== 'ready') return batch;
  const attempts = decideAttemptLifecycles({
    facts: input.facts,
    stageLifecycle: stage.stageLifecycle,
    policy: input.policy,
  });
  if (attempts.kind !== 'ready') return attempts;
  const terminal = decideTerminalLifecycle({
    facts: input.facts,
    stageLifecycle: stage.stageLifecycle,
    policy: input.policy,
  });
  if (terminal.kind !== 'ready') return terminal;

  const freezeMembership =
    input.command.transition === 'start' &&
    input.facts.stage.stage === 'sorting' &&
    !input.facts.batchMembershipFrozen;
  return {
    kind: 'commit',
    plan: {
      eventType:
        input.command.transition === 'start'
          ? 'stage_started'
          : 'stage_completed',
      stageLifecycle: stage.stageLifecycle,
      batchId: input.facts.batch.id,
      batchExpectedVersion: input.facts.batch.version,
      batchState: input.facts.batch.status,
      batchLifecycle: batch.batchLifecycle,
      freezeMembership,
      attemptLifecycles: attempts.attemptLifecycles,
      terminalLifecycle: terminal.terminalLifecycle,
      audit: stage.audit,
    },
  };
};
