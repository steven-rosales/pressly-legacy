import { isolateCounterSink, type CounterSink } from '@pressly/observability';
import type { ProductionSignalsPort } from '@pressly/production';

/** Maps bounded production workflow outcomes to the deployment counter sink. */
export const makeProductionDomainSignals = (
  counters: CounterSink,
): ProductionSignalsPort => {
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
