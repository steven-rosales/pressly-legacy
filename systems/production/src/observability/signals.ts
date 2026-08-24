import { isolateCounterSink, type CounterSink } from '@pressly/observability';
import type { ProductionSystemSignals } from '../system.ts';

/** Maps bounded production workflow outcomes to the deployment counter sink. */
export const makeProductionDomainSignals = (
  counters: CounterSink,
): Required<ProductionSystemSignals> => {
  const { increment } = isolateCounterSink(counters);

  return {
    planSuperseded: () =>
      increment('production.plan_supersessions', {
        operation: 'compute_replace_current',
      }),
    runStarted: () => increment('production.runs_started'),
    placementOutcome: ({ status, mode, reason }) =>
      increment('production.placement_outcomes', {
        status,
        mode,
        reason: reason ?? 'none',
      }),
    queueConflict: ({ operation }) =>
      increment('production.queue_conflicts', { operation }),
    batchFrozen: ({ source }) =>
      increment('production.batch_freezes', { source }),
    overtimeConfirmed: () =>
      increment('production.overtime_confirmations', {
        status: 'placed',
      }),
    orderRouteOutcome: ({ operation, status, kind, reason }) =>
      increment('production.order_route_outcomes', {
        operation,
        status,
        kind,
        reason,
      }),
    progressReconciled: ({ target, runCompleted }) =>
      increment('production.progress_reconciliations', {
        target,
        runCompleted: String(runCompleted),
      }),
  };
};

export type ProductionHttpCounterSignal = Readonly<{
  name: 'api.command_conflicts' | 'product.invariant_failures';
  attributes: Readonly<{ operation_id: string }>;
}>;

export const productionHttpCounterSignals = (input: {
  operationId: string;
  status: number;
}): readonly ProductionHttpCounterSignal[] =>
  input.operationId.startsWith('production.') && input.status === 409
    ? Object.freeze([
        {
          name: 'api.command_conflicts',
          attributes: { operation_id: input.operationId },
        },
        {
          name: 'product.invariant_failures',
          attributes: { operation_id: input.operationId },
        },
      ])
    : Object.freeze([]);
