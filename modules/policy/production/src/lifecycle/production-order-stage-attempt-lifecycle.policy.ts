import { result, stateMachine, type Result } from '@pressly/kernel';

export const productionOrderStageAttemptStates = [
  'assigned',
  'completed',
  'released',
] as const;

export type ProductionOrderStageAttemptState =
  (typeof productionOrderStageAttemptStates)[number];
export type ProductionOrderStageAttemptEvent =
  | 'complete_with_stage'
  | 'release_for_route';

export type ProductionOrderStageAttemptDecision = Readonly<{
  from: ProductionOrderStageAttemptState;
  state: ProductionOrderStageAttemptState;
}>;

export type ProductionOrderStageAttemptRejection = Readonly<{
  code:
    | 'PRODUCTION_ORDER_STAGE_ATTEMPT_STATE_INVALID'
    | 'PRODUCTION_ORDER_STAGE_ATTEMPT_EVENT_NOT_ALLOWED';
  message: string;
}>;

type AttemptEntity = Readonly<{ state: string }>;
type AttemptEvent = Readonly<{ type: ProductionOrderStageAttemptEvent }>;

const attemptInitialState = 'assigned' as const;

const attemptMachine = stateMachine.define<
  typeof productionOrderStageAttemptStates,
  AttemptEvent,
  AttemptEntity,
  undefined
>({
  name: 'production-order-stage-attempt',
  states: productionOrderStageAttemptStates,
  initial: attemptInitialState,
  terminal: ['completed', 'released'],
  getState: (entity) => entity.state,
  setState: (entity, state) => ({ ...entity, state }),
  transitions: [
    {
      from: 'assigned',
      on: 'complete_with_stage',
      to: 'completed',
      description: 'Complete the attempt with its owning stage.',
    },
    {
      from: 'assigned',
      on: 'release_for_route',
      to: 'released',
      description: 'Release the attempt when the whole order is routed.',
    },
  ],
});

const isAttemptState = (
  state: string,
): state is ProductionOrderStageAttemptState =>
  (productionOrderStageAttemptStates as readonly string[]).includes(state);

export const initialProductionOrderStageAttemptState = attemptInitialState;

export const evaluateProductionOrderStageAttemptTransition = (input: {
  state: string;
  event: ProductionOrderStageAttemptEvent;
}): Result<
  ProductionOrderStageAttemptDecision,
  ProductionOrderStageAttemptRejection
> => {
  const transition = attemptMachine.transition(
    { state: input.state },
    { type: input.event },
    undefined,
  );

  if (transition.tag === 'err')
    return result.err(
      transition.error.kind === 'unknown_state'
        ? {
            code: 'PRODUCTION_ORDER_STAGE_ATTEMPT_STATE_INVALID',
            message: 'The production order stage attempt state is invalid.',
          }
        : {
            code: 'PRODUCTION_ORDER_STAGE_ATTEMPT_EVENT_NOT_ALLOWED',
            message: 'The production order stage attempt event is not allowed.',
          },
    );

  return result.ok({
    from: transition.value.from,
    state: transition.value.to,
  });
};

export const allowedProductionOrderStageAttemptEvents = (
  state: string,
): readonly ProductionOrderStageAttemptEvent[] =>
  isAttemptState(state) ? attemptMachine.allowedEvents(state) : [];

export const productionOrderStageAttemptGraph = attemptMachine.graph;
