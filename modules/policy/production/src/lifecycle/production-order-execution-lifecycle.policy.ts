import { result, stateMachine, type Result } from '@pressly/kernel';

export const productionOrderExecutionStates = [
  'unassigned',
  'scheduled',
  'finished',
] as const;

export type ProductionOrderExecutionState =
  (typeof productionOrderExecutionStates)[number];
export type ProductionOrderExecutionEvent =
  | 'schedule_or_place'
  | 'finish_with_batch';

export type ProductionOrderExecutionDecision = Readonly<{
  from: ProductionOrderExecutionState;
  state: ProductionOrderExecutionState;
}>;

export type ProductionOrderExecutionRejection = Readonly<{
  code:
    | 'PRODUCTION_ORDER_EXECUTION_STATE_INVALID'
    | 'PRODUCTION_ORDER_EXECUTION_EVENT_NOT_ALLOWED';
  message: string;
}>;

type OrderEntity = Readonly<{ state: string }>;
type OrderEvent = Readonly<{ type: ProductionOrderExecutionEvent }>;

const orderInitialState = 'unassigned' as const;

const orderMachine = stateMachine.define<
  typeof productionOrderExecutionStates,
  OrderEvent,
  OrderEntity,
  undefined
>({
  name: 'production-order-execution',
  states: productionOrderExecutionStates,
  initial: orderInitialState,
  terminal: ['finished'],
  getState: (entity) => entity.state,
  setState: (entity, state) => ({ ...entity, state }),
  transitions: [
    {
      from: 'unassigned',
      on: 'schedule_or_place',
      to: 'scheduled',
      description: 'Commit the whole order to executable production.',
    },
    {
      from: 'scheduled',
      on: 'finish_with_batch',
      to: 'finished',
      description: 'Finish the whole order with its owning batch.',
    },
  ],
});

const isExecutionState = (
  state: string,
): state is ProductionOrderExecutionState =>
  (productionOrderExecutionStates as readonly string[]).includes(state);

const executionRank: Readonly<Record<ProductionOrderExecutionState, number>> = {
  unassigned: 0,
  scheduled: 1,
  finished: 2,
};

const executionStateFromOperationalStatus = (
  status: string,
): ProductionOrderExecutionState => {
  if (status === 'finished') return 'finished';
  if (status === 'scheduled') return 'scheduled';
  return 'unassigned';
};

export const initialProductionOrderExecutionState = orderInitialState;

export const resolveProductionOrderExecutionState = (input: {
  executionState: string | null | undefined;
  operationalStatus: string;
}): Result<
  ProductionOrderExecutionState,
  ProductionOrderExecutionRejection
> => {
  const persisted =
    input.executionState === null || input.executionState === undefined
      ? orderInitialState
      : input.executionState;
  if (!isExecutionState(persisted))
    return result.err({
      code: 'PRODUCTION_ORDER_EXECUTION_STATE_INVALID',
      message: 'The production order execution state is invalid.',
    });

  const compatible = executionStateFromOperationalStatus(
    input.operationalStatus,
  );
  return result.ok(
    executionRank[persisted] >= executionRank[compatible]
      ? persisted
      : compatible,
  );
};

export const evaluateProductionOrderExecutionTransition = (input: {
  state: string;
  event: ProductionOrderExecutionEvent;
}): Result<
  ProductionOrderExecutionDecision,
  ProductionOrderExecutionRejection
> => {
  const transition = orderMachine.transition(
    { state: input.state },
    { type: input.event },
    undefined,
  );

  if (transition.tag === 'err')
    return result.err(
      transition.error.kind === 'unknown_state'
        ? {
            code: 'PRODUCTION_ORDER_EXECUTION_STATE_INVALID',
            message: 'The production order execution state is invalid.',
          }
        : {
            code: 'PRODUCTION_ORDER_EXECUTION_EVENT_NOT_ALLOWED',
            message: 'The production order execution event is not allowed.',
          },
    );

  return result.ok({
    from: transition.value.from,
    state: transition.value.to,
  });
};

export const allowedProductionOrderExecutionEvents = (
  state: string,
): readonly ProductionOrderExecutionEvent[] =>
  isExecutionState(state) ? orderMachine.allowedEvents(state) : [];

export const productionOrderExecutionGraph = orderMachine.graph;
