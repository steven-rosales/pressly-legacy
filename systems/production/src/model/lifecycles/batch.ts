import * as result from '@pressly/cells/result';
import type { Result } from '@pressly/cells/result';
import * as stateMachine from '@pressly/cells/state-machine';

export const productionBatchLifecycleStates = [
  'queued',
  'sorting',
  'washing',
  'drying',
  'folding_packaging',
  'finished',
] as const;

export type ProductionBatchLifecycleState =
  (typeof productionBatchLifecycleStates)[number];
export type ProductionBatchLifecycleEvent =
  | 'start_sorting'
  | 'start_washing'
  | 'start_drying'
  | 'start_folding_packaging'
  | 'finish'
  | 'reconcile_to_sorting'
  | 'reconcile_to_washing'
  | 'reconcile_to_drying'
  | 'reconcile_to_folding_packaging'
  | 'reconcile_to_finished';

export type ProductionBatchLifecycleDecision = Readonly<{
  from: ProductionBatchLifecycleState;
  state: ProductionBatchLifecycleState;
}>;

export type ProductionBatchLifecycleRejection = Readonly<{
  code: 'PRODUCTION_BATCH_STATE_INVALID' | 'PRODUCTION_BATCH_EVENT_NOT_ALLOWED';
  message: string;
}>;

type BatchEntity = Readonly<{ state: string }>;
type BatchEvent = Readonly<{ type: ProductionBatchLifecycleEvent }>;

export const initialProductionBatchState = 'queued' as const;

const batchMachine = stateMachine.define<
  typeof productionBatchLifecycleStates,
  BatchEvent,
  BatchEntity,
  undefined
>({
  name: 'production-batch',
  states: productionBatchLifecycleStates,
  initial: initialProductionBatchState,
  terminal: ['finished'],
  getState: (entity) => entity.state,
  setState: (entity, state) => ({ ...entity, state }),
  transitions: [
    {
      from: 'queued',
      on: 'start_sorting',
      to: 'sorting',
      description: 'Start the batch at its sorting stage.',
    },
    {
      from: 'sorting',
      on: 'start_washing',
      to: 'washing',
      description: 'Advance the batch when washing starts.',
    },
    {
      from: 'washing',
      on: 'start_drying',
      to: 'drying',
      description: 'Advance the batch when drying starts.',
    },
    {
      from: 'drying',
      on: 'start_folding_packaging',
      to: 'folding_packaging',
      description: 'Advance the batch when folding and packaging starts.',
    },
    {
      from: 'folding_packaging',
      on: 'finish',
      to: 'finished',
      description: 'Finish the batch with its final stage.',
    },
    {
      from: 'queued',
      on: 'reconcile_to_sorting',
      to: 'sorting',
      description: 'Record operator-confirmed forward progress to sorting.',
    },
    {
      from: ['queued', 'sorting'],
      on: 'reconcile_to_washing',
      to: 'washing',
      description: 'Record operator-confirmed forward progress to washing.',
    },
    {
      from: ['queued', 'sorting', 'washing'],
      on: 'reconcile_to_drying',
      to: 'drying',
      description: 'Record operator-confirmed forward progress to drying.',
    },
    {
      from: ['queued', 'sorting', 'washing', 'drying'],
      on: 'reconcile_to_folding_packaging',
      to: 'folding_packaging',
      description:
        'Record operator-confirmed forward progress to folding and packaging.',
    },
    {
      from: ['queued', 'sorting', 'washing', 'drying', 'folding_packaging'],
      on: 'reconcile_to_finished',
      to: 'finished',
      description: 'Record operator-confirmed forward progress to finished.',
    },
  ],
});

const isBatchState = (state: string): state is ProductionBatchLifecycleState =>
  (productionBatchLifecycleStates as readonly string[]).includes(state);

export const evaluateProductionBatchTransition = (input: {
  state: string;
  event: ProductionBatchLifecycleEvent;
}): Result<
  ProductionBatchLifecycleDecision,
  ProductionBatchLifecycleRejection
> => {
  const transition = batchMachine.transition(
    { state: input.state },
    { type: input.event },
    undefined,
  );

  if (transition.tag === 'err')
    return result.err(
      transition.error.kind === 'unknown_state'
        ? {
            code: 'PRODUCTION_BATCH_STATE_INVALID',
            message: 'The production batch state is invalid.',
          }
        : {
            code: 'PRODUCTION_BATCH_EVENT_NOT_ALLOWED',
            message: 'The production batch event is not allowed.',
          },
    );

  return result.ok({
    from: transition.value.from,
    state: transition.value.to,
  });
};

export const allowedProductionBatchEvents = (
  state: string,
): readonly ProductionBatchLifecycleEvent[] =>
  isBatchState(state) ? batchMachine.allowedEvents(state) : [];

export const productionBatchGraph = batchMachine.graph;
