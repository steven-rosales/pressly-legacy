export type RemainingDayPlacementStage = Readonly<{
  stage: 'sorting' | 'washing' | 'drying' | 'folding_packaging';
  startsAt: string;
  endsAt: string;
  machineIds: readonly string[];
}>;

export type RemainingDayPlacementBatch = Readonly<{
  id: string;
  sequence: number;
  status:
    | 'queued'
    | 'sorting'
    | 'washing'
    | 'drying'
    | 'folding_packaging'
    | 'finished';
  membershipFrozen: boolean;
  orderIds: readonly string[];
  priorityOrderIds: readonly string[];
  derivedWeightLbs: number;
  bagCount: number;
  stages: readonly RemainingDayPlacementStage[];
}>;

export type RemainingDayActiveRun = Readonly<{
  run: Readonly<{
    id: string;
    queueVersion: number;
    startsAt: string;
    shiftEndsAt: string;
    pulseMinutes: number;
    pulseCapacityLbs: number;
  }>;
  machines: readonly Readonly<{
    id: string;
    stationKind: 'washing' | 'drying';
    effectiveCapacityLbs: number;
    active: boolean;
  }>[];
  batches: readonly RemainingDayPlacementBatch[];
}>;

export type RemainingDayReadyOrder = Readonly<{
  id: string;
  dueAt: string;
  priority: boolean;
  derivedWeightLbs: number;
  bagCount: number;
  version: number;
}>;

export type RemainingDayForecastInput = Readonly<{
  activeRuns: readonly RemainingDayActiveRun[];
  readyOrders: readonly RemainingDayReadyOrder[];
}>;

export type RemainingDayForecastReason =
  | 'no_active_run'
  | 'ambiguous_active_run'
  | 'placement_rejected'
  | 'current_run_window_exceeded';

export type RemainingDayForecastDecision = Readonly<{
  productionOrderId: string;
  disposition: 'ready_to_place' | 'needs_shift';
  reason: RemainingDayForecastReason | null;
}>;

export type RemainingDayForecastOutput = Readonly<{
  algorithmVersion: 'online-stable-insertion-v1';
  decisions: readonly RemainingDayForecastDecision[];
}>;

export type ProjectRemainingDayForecast = (
  input: RemainingDayForecastInput,
) => RemainingDayForecastOutput;

export type ProposeRemainingDayPlacement = (input: {
  order: Omit<RemainingDayReadyOrder, 'dueAt'>;
  run: RemainingDayActiveRun['run'];
  machines: RemainingDayActiveRun['machines'];
  batches: RemainingDayActiveRun['batches'];
  mode: Readonly<{ type: 'automatic' }>;
}) =>
  | Readonly<{ kind: 'rejected' }>
  | Readonly<{
      kind: 'proposed';
      affectedFromSequence: number;
      affectedBatches: readonly Readonly<
        Omit<RemainingDayPlacementBatch, 'id'> & {
          sourceBatchId: string | null;
        }
      >[];
      overtime: Readonly<{ required: boolean }>;
    }>;
