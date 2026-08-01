import type {
  ProductionFloorProgressTarget,
  ProductionOrderRouteReason,
} from '@pressly/contracts';

export type ProductionSignalsPort = Readonly<{
  planSuperseded: () => void;
  runStarted: () => void;
  placementOutcome: (input: {
    status: 'placed' | 'confirmation_required' | 'not_placed';
    mode: 'automatic' | 'manager_exact';
    reason?: string;
  }) => void;
  queueConflict: (input: { operation: string }) => void;
  batchFrozen: (input: { source: 'explicit' | 'stage_start' }) => void;
  overtimeConfirmed: () => void;
  orderRouteOutcome: (input: {
    operation: 'preview' | 'commit';
    status:
      | 'proposed'
      | 'committed'
      | 'replayed'
      | 'rejected'
      | 'conflict'
      | 'failed';
    kind: 'queued_move' | 'exception';
    reason: ProductionOrderRouteReason;
  }) => void;
  progressReconciled: (input: {
    target: ProductionFloorProgressTarget;
    runCompleted: boolean;
  }) => void;
}>;

export const nullProductionSignals: ProductionSignalsPort = {
  planSuperseded: () => undefined,
  runStarted: () => undefined,
  placementOutcome: () => undefined,
  queueConflict: () => undefined,
  batchFrozen: () => undefined,
  overtimeConfirmed: () => undefined,
  orderRouteOutcome: () => undefined,
  progressReconciled: () => undefined,
};
