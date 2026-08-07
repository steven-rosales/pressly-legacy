import {
  result,
  stateMachine,
  type CodedFailure,
  type Result,
} from '@pressly/kernel';

export type StageState = 'planned' | 'started' | 'completed';
export type StageEvent =
  | Readonly<{ type: 'start' }>
  | Readonly<{ type: 'complete' }>
  | Readonly<{ type: 'reconcile_start' }>
  | Readonly<{ type: 'reconcile_complete' }>;
export type StageEntity = Readonly<{
  state: string;
  plannedStartAt: Date;
  plannedEndAt: Date;
  actualStartAt: Date | null;
}>;
export type StageContext = Readonly<{
  now: Date;
  productionRunStarted: boolean;
  previousStageCompleted: boolean;
  sameKindAlreadyActive: boolean;
  machinesRequired: boolean;
  assignedMachineIds: readonly string[];
  overlappingMachineIds: readonly string[];
}>;

export const stageActionBlockCodes = [
  'PRODUCTION_RUN_NOT_STARTED',
  'PREVIOUS_STAGE_INCOMPLETE',
  'STAGE_KIND_ALREADY_ACTIVE',
  'MACHINE_ASSIGNMENT_REQUIRED',
  'MACHINE_ASSIGNMENT_OVERLAPS',
] as const;

export type StageActionBlockCode = (typeof stageActionBlockCodes)[number];
export type StageStartTiming = Readonly<{
  plannedStartAt: string;
  plannedEndAt: string;
  observedAt: string;
  remainingMilliseconds: number;
}>;
export type StageCompletionTiming = Readonly<{
  actualStartAt: string;
  plannedEndAt: string;
  completionBoundaryAt: string;
  observedAt: string;
  plannedDurationMilliseconds: number;
  elapsedMilliseconds: number;
  remainingMilliseconds: number;
}>;
export type StageTransitionDecision =
  | Readonly<{
      status: 'allowed';
      from: StageState;
      state: StageState;
    }>
  | Readonly<{
      status: 'confirmation_required';
      action: 'start';
      code: 'PLANNED_START_NOT_REACHED';
      message: string;
      timing: StageStartTiming;
    }>
  | Readonly<{
      status: 'confirmation_required';
      action: 'complete';
      code: 'PULSE_BOUNDARY_NOT_REACHED';
      message: string;
      timing: StageCompletionTiming;
    }>;
export type StageNextAction =
  | Readonly<{ state: 'available'; action: 'start' | 'complete' }>
  | Readonly<{
      state: 'blocked';
      action: 'start' | 'complete';
      code: StageActionBlockCode;
      message: string;
      availableAt: string | null;
    }>
  | Readonly<{
      state: 'confirmation_required';
      action: 'start';
      code: 'PLANNED_START_NOT_REACHED';
      message: string;
      availableAt: string;
      timing: StageStartTiming;
    }>
  | Readonly<{
      state: 'confirmation_required';
      action: 'complete';
      code: 'PULSE_BOUNDARY_NOT_REACHED';
      message: string;
      availableAt: string;
      timing: StageCompletionTiming;
    }>
  | Readonly<{ state: 'terminal'; reason: 'stage_completed' }>;

const rejection = (code: string, message: string) => ({ code, message });

const completionBoundary = (entity: StageEntity): Date | null => {
  if (entity.actualStartAt === null) return null;
  const pulseDurationMs =
    entity.plannedEndAt.getTime() - entity.plannedStartAt.getTime();
  return new Date(
    Math.max(
      entity.plannedEndAt.getTime(),
      entity.actualStartAt.getTime() + pulseDurationMs,
    ),
  );
};

const startTiming = (entity: StageEntity, now: Date): StageStartTiming => ({
  plannedStartAt: entity.plannedStartAt.toISOString(),
  plannedEndAt: entity.plannedEndAt.toISOString(),
  observedAt: now.toISOString(),
  remainingMilliseconds: Math.max(
    0,
    entity.plannedStartAt.getTime() - now.getTime(),
  ),
});

const completionTiming = (
  entity: StageEntity,
  now: Date,
): StageCompletionTiming | null => {
  if (entity.actualStartAt === null) return null;
  const boundary = completionBoundary(entity);
  if (boundary === null) return null;

  const plannedDurationMilliseconds =
    entity.plannedEndAt.getTime() - entity.plannedStartAt.getTime();
  return {
    actualStartAt: entity.actualStartAt.toISOString(),
    plannedEndAt: entity.plannedEndAt.toISOString(),
    completionBoundaryAt: boundary.toISOString(),
    observedAt: now.toISOString(),
    plannedDurationMilliseconds,
    elapsedMilliseconds: Math.max(
      0,
      now.getTime() - entity.actualStartAt.getTime(),
    ),
    remainingMilliseconds: Math.max(0, boundary.getTime() - now.getTime()),
  };
};

const validateEvaluationClock = (
  entity: StageEntity,
  context: StageContext,
): CodedFailure | null => {
  if (!Number.isFinite(context.now.getTime()))
    return rejection('STAGE_CLOCK_INVALID', 'Clock is invalid.');
  if (
    !Number.isFinite(entity.plannedStartAt.getTime()) ||
    !Number.isFinite(entity.plannedEndAt.getTime()) ||
    entity.plannedEndAt.getTime() <= entity.plannedStartAt.getTime()
  )
    return rejection(
      'STAGE_WINDOW_INVALID',
      'Stage end must be after stage start.',
    );
  if (
    entity.actualStartAt !== null &&
    !Number.isFinite(entity.actualStartAt.getTime())
  )
    return rejection(
      'STAGE_CLOCK_INVALID',
      'Actual stage start time is invalid.',
    );
  return null;
};

const stageMachine = stateMachine.define<
  readonly ['planned', 'started', 'completed'],
  StageEvent,
  StageEntity,
  StageContext
>({
  name: 'production-stage',
  states: ['planned', 'started', 'completed'],
  initial: 'planned',
  terminal: ['completed'],
  getState: (entity) => entity.state,
  setState: (entity, next) => ({ ...entity, state: next }),
  transitions: [
    {
      from: 'planned',
      on: 'start',
      to: 'started',
      guards: [
        {
          name: 'production-run-started',
          check: (args) =>
            args.ctx.productionRunStarted
              ? result.ok(args)
              : result.err(
                  rejection(
                    'PRODUCTION_RUN_NOT_STARTED',
                    'The production run must start before a stage can start.',
                  ),
                ),
        },
        {
          name: 'planned-boundary-reached',
          check: (args) =>
            Number.isFinite(args.ctx.now.getTime())
              ? result.ok(args)
              : result.err(
                  rejection('STAGE_CLOCK_INVALID', 'Clock is invalid.'),
                ),
        },
        {
          name: 'previous-stage-completed',
          check: (args) =>
            args.ctx.previousStageCompleted
              ? result.ok(args)
              : result.err(
                  rejection(
                    'PREVIOUS_STAGE_INCOMPLETE',
                    'The previous stage must complete first.',
                  ),
                ),
        },
        {
          name: 'one-active-batch-per-kind',
          check: (args) =>
            !args.ctx.sameKindAlreadyActive
              ? result.ok(args)
              : result.err(
                  rejection(
                    'STAGE_KIND_ALREADY_ACTIVE',
                    'Another batch is active in this stage kind.',
                  ),
                ),
        },
        {
          name: 'machine-assignment-valid',
          check: (args) =>
            !args.ctx.machinesRequired ||
            (args.ctx.assignedMachineIds.length > 0 &&
              args.ctx.overlappingMachineIds.length === 0)
              ? result.ok(args)
              : result.err(
                  rejection(
                    args.ctx.overlappingMachineIds.length > 0
                      ? 'MACHINE_ASSIGNMENT_OVERLAPS'
                      : 'MACHINE_ASSIGNMENT_REQUIRED',
                    'Stage machine assignment is invalid.',
                  ),
                ),
        },
      ],
    },
    {
      from: 'started',
      on: 'complete',
      to: 'completed',
      guards: [],
    },
    {
      from: 'planned',
      on: 'reconcile_start',
      to: 'started',
      guards: [],
      description: 'Record operator-confirmed progress into the stage.',
    },
    {
      from: ['planned', 'started'],
      on: 'reconcile_complete',
      to: 'completed',
      guards: [],
      description: 'Record operator-confirmed progress beyond the stage.',
    },
  ],
  invariants: [
    {
      name: 'positive-stage-window',
      check: (args) =>
        args.entity.plannedEndAt.getTime() >
        args.entity.plannedStartAt.getTime()
          ? result.ok(args)
          : result.err(
              rejection(
                'STAGE_WINDOW_INVALID',
                'Stage end must be after stage start.',
              ),
            ),
    },
  ],
});

export const initialProductionStageState = 'planned' as const;

export const evaluateStageTransition = (
  entity: StageEntity,
  event: StageEvent,
  context: StageContext,
): Result<StageTransitionDecision, CodedFailure> => {
  const invalidClock = validateEvaluationClock(entity, context);
  if (invalidClock !== null) return result.err(invalidClock);

  if (event.type === 'complete') {
    const timing = completionTiming(entity, context.now);
    if (timing !== null && timing.remainingMilliseconds > 0)
      return result.ok({
        status: 'confirmation_required',
        action: 'complete',
        code: 'PULSE_BOUNDARY_NOT_REACHED',
        message:
          'This stage has not yet occupied its planned production pulse.',
        timing,
      });
  }

  const transition = stageMachine.transition(entity, event, context);

  if (transition.tag === 'err')
    return result.err({
      code:
        'code' in transition.error
          ? transition.error.code
          : transition.error.kind.toUpperCase(),
      message:
        'message' in transition.error && transition.error.message !== undefined
          ? transition.error.message
          : 'The production stage transition is not allowed.',
    });

  if (
    event.type === 'start' &&
    context.now.getTime() < entity.plannedStartAt.getTime()
  )
    return result.ok({
      status: 'confirmation_required',
      action: 'start',
      code: 'PLANNED_START_NOT_REACHED',
      message:
        'This stage is scheduled to start later. Confirm to start it now without changing the planned production window.',
      timing: startTiming(entity, context.now),
    });

  return result.ok({
    status: 'allowed',
    from: transition.value.from,
    state: transition.value.to,
  });
};

const isStageActionBlockCode = (value: string): value is StageActionBlockCode =>
  (stageActionBlockCodes as readonly string[]).includes(value);

export const evaluateStageNextAction = (
  entity: StageEntity,
  context: StageContext,
): Result<StageNextAction, CodedFailure> => {
  const invalidClock = validateEvaluationClock(entity, context);
  if (invalidClock !== null) return result.err(invalidClock);

  if (entity.state === 'completed')
    return result.ok({ state: 'terminal', reason: 'stage_completed' });

  if (entity.state !== 'planned' && entity.state !== 'started')
    return result.err(
      rejection('STAGE_STATE_INVALID', 'Production stage state is invalid.'),
    );

  const action = entity.state === 'planned' ? 'start' : 'complete';
  const decision = evaluateStageTransition(entity, { type: action }, context);
  if (decision.tag === 'ok') {
    if (
      decision.value.status === 'confirmation_required' &&
      decision.value.action === 'start'
    )
      return result.ok({
        state: 'confirmation_required',
        action: 'start',
        code: decision.value.code,
        message: decision.value.message,
        availableAt: decision.value.timing.plannedStartAt,
        timing: decision.value.timing,
      });
    if (
      decision.value.status === 'confirmation_required' &&
      decision.value.action === 'complete'
    )
      return result.ok({
        state: 'confirmation_required',
        action: 'complete',
        code: decision.value.code,
        message: decision.value.message,
        availableAt: decision.value.timing.completionBoundaryAt,
        timing: decision.value.timing,
      });
    return result.ok({ state: 'available', action });
  }
  if (!isStageActionBlockCode(decision.error.code))
    return result.err(decision.error);

  return result.ok({
    state: 'blocked',
    action,
    code: decision.error.code,
    message: decision.error.message,
    availableAt: null,
  });
};

export const productionStageGraph = stageMachine.graph;

export const allowedProductionStageEvents = (
  state: string,
): readonly StageEvent['type'][] =>
  state === 'planned' || state === 'started' || state === 'completed'
    ? stageMachine.allowedEvents(state)
    : [];
