import { result, stateMachine, type Result } from '@pressly/kernel';

export type StageState = 'planned' | 'started' | 'completed';
export type StageEvent =
  | Readonly<{ type: 'start' }>
  | Readonly<{ type: 'complete' }>;
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

const rejection = (code: string, message: string) => ({ code, message });

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
      guards: [
        {
          name: 'pulse-boundary-reached',
          check: (args) => {
            if (args.entity.actualStartAt === null)
              return result.err(
                rejection(
                  'STAGE_ACTUAL_START_MISSING',
                  'A started stage requires its actual start time.',
                ),
              );

            const pulseDurationMs =
              args.entity.plannedEndAt.getTime() -
              args.entity.plannedStartAt.getTime();
            const completionBoundary = Math.max(
              args.entity.plannedEndAt.getTime(),
              args.entity.actualStartAt.getTime() + pulseDurationMs,
            );
            return args.ctx.now.getTime() >= completionBoundary
              ? result.ok(args)
              : result.err(
                  rejection(
                    'PULSE_BOUNDARY_NOT_REACHED',
                    'A stage must occupy one full pulse after its actual start.',
                  ),
                );
          },
        },
      ],
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

export const evaluateStageTransition = (
  entity: StageEntity,
  event: StageEvent,
  context: StageContext,
): Result<
  Readonly<{ state: StageState }>,
  Readonly<{ code: string; message: string }>
> => {
  if (
    event.type === 'start' &&
    context.now.getTime() < entity.plannedStartAt.getTime()
  )
    return result.err(
      rejection(
        'STAGE_BOUNDARY_NOT_REACHED',
        'A stage cannot start before its planned boundary.',
      ),
    );

  if (
    entity.actualStartAt !== null &&
    !Number.isFinite(entity.actualStartAt.getTime())
  )
    return result.err(
      rejection('STAGE_CLOCK_INVALID', 'Actual stage start time is invalid.'),
    );

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

  return result.ok({ state: transition.value.to });
};

export const productionStageGraph = stageMachine.graph;
