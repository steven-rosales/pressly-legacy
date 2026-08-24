import * as result from '@pressly/cells/result';
import type { Result } from '@pressly/cells/result';
import * as stateMachine from '@pressly/cells/state-machine';

export type ProductionShiftLifecycleState = 'open' | 'closed';
export type ProductionShiftLifecycleEvent = 'close_after_execution';

export type ProductionShiftLifecycleDecision = Readonly<{
  from: ProductionShiftLifecycleState;
  state: ProductionShiftLifecycleState;
}>;

export type ProductionShiftLifecycleRejection = Readonly<{
  code: 'PRODUCTION_SHIFT_STATE_INVALID' | 'PRODUCTION_SHIFT_EVENT_NOT_ALLOWED';
  message: string;
}>;

type ShiftEntity = Readonly<{ state: string }>;
type ShiftEvent = Readonly<{ type: ProductionShiftLifecycleEvent }>;

const shiftStates = ['open', 'closed'] as const;
export const initialProductionShiftState = 'open' as const;

const shiftMachine = stateMachine.define<
  typeof shiftStates,
  ShiftEvent,
  ShiftEntity,
  undefined
>({
  name: 'production-shift',
  states: shiftStates,
  initial: initialProductionShiftState,
  terminal: ['closed'],
  getState: (entity) => entity.state,
  setState: (entity, state) => ({ ...entity, state }),
  transitions: [
    {
      from: 'open',
      on: 'close_after_execution',
      to: 'closed',
      description:
        'Close the shift atomically when its final production work completes.',
    },
  ],
});

const isShiftState = (state: string): state is ProductionShiftLifecycleState =>
  (shiftStates as readonly string[]).includes(state);

export const evaluateProductionShiftTransition = (input: {
  state: string;
  event: ProductionShiftLifecycleEvent;
}): Result<
  ProductionShiftLifecycleDecision,
  ProductionShiftLifecycleRejection
> => {
  const transition = shiftMachine.transition(
    { state: input.state },
    { type: input.event },
    undefined,
  );

  if (transition.tag === 'err')
    return result.err(
      transition.error.kind === 'unknown_state'
        ? {
            code: 'PRODUCTION_SHIFT_STATE_INVALID',
            message: 'The production shift state is invalid.',
          }
        : {
            code: 'PRODUCTION_SHIFT_EVENT_NOT_ALLOWED',
            message: 'The production shift event is not allowed.',
          },
    );

  return result.ok({
    from: transition.value.from,
    state: transition.value.to,
  });
};

export const allowedProductionShiftEvents = (
  state: string,
): readonly ProductionShiftLifecycleEvent[] =>
  isShiftState(state) ? shiftMachine.allowedEvents(state) : [];

export const productionShiftGraph = shiftMachine.graph;
