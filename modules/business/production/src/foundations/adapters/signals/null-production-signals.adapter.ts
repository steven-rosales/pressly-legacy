import type { ProductionSignalsPort } from '../../ports/signals/production-signals.port.ts';

export const nullProductionSignals: ProductionSignalsPort = Object.freeze({
  planSuperseded: () => undefined,
  runStarted: () => undefined,
  placementOutcome: () => undefined,
  queueConflict: () => undefined,
  batchFrozen: () => undefined,
  overtimeConfirmed: () => undefined,
  orderRouteOutcome: () => undefined,
  progressReconciled: () => undefined,
});
