import * as result from '@pressly/cells/result';
import type { Result } from '@pressly/cells/result';
import * as stateMachine from '@pressly/cells/state-machine';

export type ProductionRunLifecycleState = 'started' | 'completed';
export type ProductionRunLifecycleEvent = 'complete_final_batch';

export type ProductionRunLifecycleDecision = Readonly<{
  from: ProductionRunLifecycleState;
  state: ProductionRunLifecycleState;
}>;

export type ProductionRunLifecycleRejection = Readonly<{
  code: 'PRODUCTION_RUN_STATE_INVALID' | 'PRODUCTION_RUN_EVENT_NOT_ALLOWED';
  message: string;
}>;

type RunEntity = Readonly<{ state: string }>;
type RunEvent = Readonly<{ type: ProductionRunLifecycleEvent }>;

const runStates = ['started', 'completed'] as const;
export const initialProductionRunState = 'started' as const;

const runMachine = stateMachine.define<
  typeof runStates,
  RunEvent,
  RunEntity,
  undefined
>({
  name: 'production-run',
  states: runStates,
  initial: initialProductionRunState,
  terminal: ['completed'],
  getState: (entity) => entity.state,
  setState: (entity, state) => ({ ...entity, state }),
  transitions: [
    {
      from: 'started',
      on: 'complete_final_batch',
      to: 'completed',
      description:
        'Complete the run atomically when its final batch completes.',
    },
  ],
});

const isRunState = (state: string): state is ProductionRunLifecycleState =>
  (runStates as readonly string[]).includes(state);

export const evaluateProductionRunTransition = (input: {
  state: string;
  event: ProductionRunLifecycleEvent;
}): Result<ProductionRunLifecycleDecision, ProductionRunLifecycleRejection> => {
  const transition = runMachine.transition(
    { state: input.state },
    { type: input.event },
    undefined,
  );

  if (transition.tag === 'err')
    return result.err(
      transition.error.kind === 'unknown_state'
        ? {
            code: 'PRODUCTION_RUN_STATE_INVALID',
            message: 'The production run state is invalid.',
          }
        : {
            code: 'PRODUCTION_RUN_EVENT_NOT_ALLOWED',
            message: 'The production run event is not allowed.',
          },
    );

  return result.ok({
    from: transition.value.from,
    state: transition.value.to,
  });
};

export const allowedProductionRunEvents = (
  state: string,
): readonly ProductionRunLifecycleEvent[] =>
  isRunState(state) ? runMachine.allowedEvents(state) : [];

export const productionRunGraph = runMachine.graph;
