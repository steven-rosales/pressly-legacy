import type { OnlinePlacementInput } from '../scheduling/online-placement.port.ts';

export type RemainingDayForecastInput = Readonly<{
  activeRuns: readonly Readonly<{
    run: OnlinePlacementInput['run'];
    machines: OnlinePlacementInput['machines'];
    batches: OnlinePlacementInput['batches'];
  }>[];
  readyOrders: readonly Readonly<{
    id: string;
    dueAt: string;
    priority: boolean;
    derivedWeightLbs: number;
    bagCount: number;
    version: number;
  }>[];
}>;

export type RemainingDayForecastDecision = Readonly<{
  productionOrderId: string;
  disposition: 'ready_to_place' | 'needs_shift';
  reason:
    | 'no_active_run'
    | 'ambiguous_active_run'
    | 'placement_rejected'
    | 'current_run_window_exceeded'
    | null;
}>;

export type RemainingDayForecastOutput = Readonly<{
  algorithmVersion: 'online-stable-insertion-v1';
  decisions: readonly RemainingDayForecastDecision[];
}>;

export type RemainingDayForecastSchedulerPort = Readonly<{
  projectRemainingDayForecast: (
    input: RemainingDayForecastInput,
  ) => RemainingDayForecastOutput;
}>;
