import type { CounterSink } from '@pressly/metrics';
import type { ProductionSignalsPort } from '@pressly/production';

/** Domain-outcome counters for commands committed by the webhook worker. */
export const makeProductionDomainSignals = (
  counters: CounterSink,
): ProductionSignalsPort => ({
  planSuperseded: () =>
    counters.increment('production.plan_supersessions', {
      operation: 'compute_replace_current',
    }),
  runStarted: () => counters.increment('production.runs_started'),
  placementOutcome: ({ status, mode, reason }) =>
    counters.increment('production.placement_outcomes', {
      status,
      mode,
      reason: reason ?? 'none',
    }),
  queueConflict: ({ operation }) =>
    counters.increment('production.queue_conflicts', { operation }),
  batchFrozen: ({ source }) =>
    counters.increment('production.batch_freezes', { source }),
  overtimeConfirmed: () =>
    counters.increment('production.overtime_confirmations', {
      status: 'placed',
    }),
});
