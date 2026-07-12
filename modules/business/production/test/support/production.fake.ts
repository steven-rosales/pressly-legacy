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
  evaluateStageTransition: (entity, event, context) => {
    if (event.type === 'start' && !context.productionRunStarted)
      return {
        tag: 'err',
        error: {
          code: 'PRODUCTION_RUN_NOT_STARTED',
          message: 'Production run not started.',
        },
      };
    if (event.type === 'complete') {
      if (entity.actualStartAt === null)
        return {
          tag: 'err',
          error: {
            code: 'STAGE_ACTUAL_START_MISSING',
            message: 'Actual stage start is missing.',
          },
        };
      const pulseDurationMs =
        entity.plannedEndAt.getTime() - entity.plannedStartAt.getTime();
      const completionBoundary = Math.max(
        entity.plannedEndAt.getTime(),
        entity.actualStartAt.getTime() + pulseDurationMs,
      );
      if (context.now.getTime() < completionBoundary)
        return {
          tag: 'err',
          error: {
            code: 'PULSE_BOUNDARY_NOT_REACHED',
            message: 'Pulse boundary not reached.',
          },
        };
    }
    return {
      tag: 'ok',
      value: { state: event.type === 'start' ? 'started' : 'completed' },
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
      algorithmVersion: 'fixed-pulse-ffd-v1',
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
};
