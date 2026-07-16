import type {
  ClockPort,
  IdPort,
  ProductionPolicyPort,
  ProductionSchedulerPort,
  SchedulingInput,
  SchedulingOutput,
} from '../../src/production.port.ts';

export const makeIds = (): IdPort => {
  let value = 1;
  return {
    next: () =>
      `00000000-0000-4000-8000-${(value++).toString().padStart(12, '0')}`,
  };
};

export const makeClock = (initial: string) => {
  let now = new Date(initial);
  const clock: ClockPort = { now: () => new Date(now) };

  return {
    clock,
    set: (next: string) => {
      now = new Date(next);
    },
  };
};

export const allowPolicy: ProductionPolicyPort = {
  evaluateEligibility: ({ bagCount }) =>
    bagCount === null
      ? {
          tag: 'err',
          error: {
            code: 'ORDER_BAG_COUNT_MISSING',
            message: 'Bag intake is required before scheduling.',
          },
        }
      : { tag: 'ok', value: { eligible: true } },
  evaluateScheduleAcceptance: () => ({
    tag: 'ok',
    value: { accepted: true },
  }),
  evaluateCurrentPlanAcceptance: () => ({
    tag: 'ok',
    value: { current: true },
  }),
  evaluateScheduleStart: () => ({
    tag: 'ok',
    value: { started: true },
  }),
  evaluateShiftPlanningWindow: () => ({
    tag: 'ok',
    value: { allowed: true },
  }),
  evaluateBatchMembershipTransition: ({ action }) => ({
    tag: 'ok',
    value: { membershipFrozen: action === 'freeze' },
  }),
  evaluatePlacementCommit: () => ({
    tag: 'ok',
    value: { commit: true },
  }),
  evaluateOrderRouting: (input) => {
    const stages = [
      'sorting',
      'washing',
      'drying',
      'folding_packaging',
    ] as const;
    const target = input.targetCandidates[0];
    if (target === undefined)
      return {
        decision: 'rejected',
        command: input.command,
        reason: {
          code: 'NO_FEASIBLE_TARGET' as const,
          message: 'No test target was supplied.',
        },
      };
    const currentIndex = stages.indexOf(input.currentStage);
    const restartIndex = stages.indexOf(input.restartStage);
    return {
      decision: 'accepted',
      command: input.command,
      wholeOrder: { ...input.order },
      route: {
        sourceProductionBatchId: input.source.productionBatchId,
        sourceSequence: input.source.sequence,
        targetProductionBatchId: target.productionBatchId,
        targetSequence: target.sequence,
        currentStage: input.currentStage,
        restartStage: input.restartStage,
        releasedUnfinishedStages: stages.slice(currentIndex),
        reworkStages: stages.slice(restartIndex, currentIndex),
        targetAssignments: stages.slice(restartIndex).map((stage) => {
          const targetStage = target.stages.find(
            (candidate) => candidate.stage === stage,
          );
          if (targetStage === undefined)
            throw new Error(`Missing test target stage: ${stage}.`);
          return {
            stage,
            sourceDisposition:
              stages.indexOf(stage) < currentIndex
                ? ('preserve_completed_for_rework' as const)
                : ('release_unfinished' as const),
            assignedWeightBeforeLbs: targetStage.assignedWeightLbs,
            assignedWeightAfterLbs:
              targetStage.assignedWeightLbs + input.order.weightLbs,
            capacityLbs: targetStage.capacityLbs,
          };
        }),
      },
    };
  },
  evaluateFloorProgressReconciliation: (input) => {
    const targetIndex = [
      'sorting_started',
      'sorting_completed',
      'washing_started',
      'washing_completed',
      'drying_started',
      'drying_completed',
      'folding_packaging_started',
      'finished',
    ].indexOf(input.target);
    const stages = [
      'sorting',
      'washing',
      'drying',
      'folding_packaging',
    ] as const;
    return {
      tag: 'ok',
      value: {
        currentMilestone: 'waiting_to_sort' as const,
        targetMilestone: input.target,
        batchStatus:
          targetIndex >= 7
            ? ('finished' as const)
            : targetIndex >= 6
              ? ('folding_packaging' as const)
              : targetIndex >= 4
                ? ('drying' as const)
                : targetIndex >= 2
                  ? ('washing' as const)
                  : ('sorting' as const),
        completedStages: stages.filter(
          (_, index) => targetIndex >= index * 2 + 1,
        ),
        activeStage:
          targetIndex % 2 === 0 && targetIndex < 7
            ? (stages[targetIndex / 2] ?? null)
            : null,
        stages: input.stages.map((stage, index) => ({
          stageRunId: stage.stageRunId,
          stage: stages[index] ?? 'sorting',
          currentStatus: stage.status as 'planned' | 'started' | 'completed',
          nextStatus:
            targetIndex >= index * 2 + 1
              ? ('completed' as const)
              : targetIndex === index * 2
                ? ('started' as const)
                : ('planned' as const),
        })),
      },
    };
  },
  evaluateStageNextAction: (entity, context) => {
    if (entity.state === 'completed')
      return {
        tag: 'ok',
        value: { state: 'terminal', reason: 'stage_completed' },
      };
    const action = entity.state === 'planned' ? 'start' : 'complete';
    if (action === 'start' && !context.productionRunStarted)
      return {
        tag: 'ok',
        value: {
          state: 'blocked',
          action,
          code: 'PRODUCTION_RUN_NOT_STARTED',
          message: 'Production run not started.',
          availableAt: null,
        },
      };
    if (action === 'start' && !context.previousStageCompleted)
      return {
        tag: 'ok',
        value: {
          state: 'blocked',
          action,
          code: 'PREVIOUS_STAGE_INCOMPLETE',
          message: 'Previous stage incomplete.',
          availableAt: null,
        },
      };
    if (action === 'start' && context.sameKindAlreadyActive)
      return {
        tag: 'ok',
        value: {
          state: 'blocked',
          action,
          code: 'STAGE_KIND_ALREADY_ACTIVE',
          message: 'Stage kind already active.',
          availableAt: null,
        },
      };
    if (
      action === 'start' &&
      context.machinesRequired &&
      (context.assignedMachineIds.length === 0 ||
        context.overlappingMachineIds.length > 0)
    )
      return {
        tag: 'ok',
        value: {
          state: 'blocked',
          action,
          code:
            context.overlappingMachineIds.length > 0
              ? 'MACHINE_ASSIGNMENT_OVERLAPS'
              : 'MACHINE_ASSIGNMENT_REQUIRED',
          message: 'Stage machine assignment is invalid.',
          availableAt: null,
        },
      };
    if (action === 'start' && context.now < entity.plannedStartAt)
      return {
        tag: 'ok',
        value: {
          state: 'confirmation_required',
          action,
          code: 'PLANNED_START_NOT_REACHED',
          message: 'Stage is scheduled to start later.',
          availableAt: entity.plannedStartAt.toISOString(),
          timing: {
            plannedStartAt: entity.plannedStartAt.toISOString(),
            plannedEndAt: entity.plannedEndAt.toISOString(),
            observedAt: context.now.toISOString(),
            remainingMilliseconds:
              entity.plannedStartAt.getTime() - context.now.getTime(),
          },
        },
      };
    if (action === 'complete') {
      if (entity.actualStartAt === null)
        return { tag: 'ok', value: { state: 'available', action } };
      const pulseDurationMs =
        entity.plannedEndAt.getTime() - entity.plannedStartAt.getTime();
      const availableAt = new Date(
        Math.max(
          entity.plannedEndAt.getTime(),
          entity.actualStartAt.getTime() + pulseDurationMs,
        ),
      );
      if (context.now < availableAt)
        return {
          tag: 'ok',
          value: {
            state: 'confirmation_required',
            action: 'complete',
            code: 'PULSE_BOUNDARY_NOT_REACHED',
            message: 'Pulse boundary not reached.',
            availableAt: availableAt.toISOString(),
            timing: {
              actualStartAt: entity.actualStartAt.toISOString(),
              plannedEndAt: entity.plannedEndAt.toISOString(),
              completionBoundaryAt: availableAt.toISOString(),
              observedAt: context.now.toISOString(),
              plannedDurationMilliseconds: pulseDurationMs,
              elapsedMilliseconds: Math.max(
                0,
                context.now.getTime() - entity.actualStartAt.getTime(),
              ),
              remainingMilliseconds:
                availableAt.getTime() - context.now.getTime(),
            },
          },
        };
    }
    return { tag: 'ok', value: { state: 'available', action } };
  },
  evaluateStageTransition: (entity, event, context) => {
    if (event.type === 'start' && !context.productionRunStarted)
      return {
        tag: 'err',
        error: {
          code: 'PRODUCTION_RUN_NOT_STARTED',
          message: 'Production run not started.',
        },
      };
    if (event.type === 'start' && context.now < entity.plannedStartAt)
      return {
        tag: 'ok',
        value: {
          status: 'confirmation_required',
          action: 'start',
          code: 'PLANNED_START_NOT_REACHED',
          message: 'Stage is scheduled to start later.',
          timing: {
            plannedStartAt: entity.plannedStartAt.toISOString(),
            plannedEndAt: entity.plannedEndAt.toISOString(),
            observedAt: context.now.toISOString(),
            remainingMilliseconds:
              entity.plannedStartAt.getTime() - context.now.getTime(),
          },
        },
      };
    if (event.type === 'complete' && entity.actualStartAt !== null) {
      const pulseDurationMs =
        entity.plannedEndAt.getTime() - entity.plannedStartAt.getTime();
      const completionBoundary = Math.max(
        entity.plannedEndAt.getTime(),
        entity.actualStartAt.getTime() + pulseDurationMs,
      );
      if (context.now.getTime() < completionBoundary)
        return {
          tag: 'ok',
          value: {
            status: 'confirmation_required',
            action: 'complete',
            code: 'PULSE_BOUNDARY_NOT_REACHED',
            message: 'Pulse boundary not reached.',
            timing: {
              actualStartAt: entity.actualStartAt.toISOString(),
              plannedEndAt: entity.plannedEndAt.toISOString(),
              completionBoundaryAt: new Date(completionBoundary).toISOString(),
              observedAt: context.now.toISOString(),
              plannedDurationMilliseconds: pulseDurationMs,
              elapsedMilliseconds: Math.max(
                0,
                context.now.getTime() - entity.actualStartAt.getTime(),
              ),
              remainingMilliseconds: completionBoundary - context.now.getTime(),
            },
          },
        };
    }
    return {
      tag: 'ok',
      value: {
        status: 'allowed',
        state: event.type === 'start' ? 'started' : 'completed',
      },
    };
  },
  evaluateMachineAssignment: (input) => ({
    tag: 'ok',
    value: { machineIds: input.machines.map((machine) => machine.id) },
  }),
};

const addMinutes = (instant: string, minutes: number) =>
  new Date(Date.parse(instant) + minutes * 60_000).toISOString();

export const simpleScheduler: ProductionSchedulerPort = {
  propose: (input: SchedulingInput): SchedulingOutput => {
    const batches = input.orders.map((order, sequence) => ({
      sequence,
      orderIds: [order.id],
      derivedWeightLbs: order.derivedWeightLbs,
      bagCount: order.bagCount,
      stages: (
        ['sorting', 'washing', 'drying', 'folding_packaging'] as const
      ).map((stage, stageIndex) => {
        const startsAt = addMinutes(
          input.shift.startsAt,
          (sequence + stageIndex) * input.config.pulseMinutes,
        );
        return {
          stage,
          startsAt,
          endsAt: addMinutes(startsAt, input.config.pulseMinutes),
          machineIds:
            stage === 'washing' || stage === 'drying'
              ? input.machines
                  .filter((machine) => machine.stationKind === stage)
                  .map((machine) => machine.id)
              : [],
        };
      }),
    }));
    const makespanMinutes =
      batches.length === 0
        ? 0
        : (batches.length + 3) * input.config.pulseMinutes;

    return {
      algorithmVersion: 'fixed-pulse-ffd-v2',
      inputSnapshotHash: 'a'.repeat(64),
      outputPlanHash: 'b'.repeat(64),
      canonicalOutput: '{}',
      pulseMinutes: input.config.pulseMinutes,
      pulseCapacityLbs: 224,
      batchCount: batches.length,
      makespanMinutes,
      plannedCompletionAt: addMinutes(input.shift.startsAt, makespanMinutes),
      batches,
      unplacedOrderIds: [],
      warnings: [],
    };
  },
  proposeOnlinePlacement: () => ({
    kind: 'rejected',
    algorithmVersion: 'online-stable-insertion-v1',
    inputSnapshotHash: 'c'.repeat(64),
    reason: {
      code: 'UNSUPPORTED_TEST_PLACEMENT',
      message: 'This scheduler fake does not exercise online placement.',
    },
  }),
};
