import type {
  DemandForecastInput,
  DemandForecastOutput,
  SchedulingInput,
  SchedulingOutput,
} from '../scheduling/production-scheduling.port.ts';
import type { RemainingDayForecastSchedulerPort } from './remaining-day-forecast.port.ts';
import type {
  OnlinePlacementInput,
  OnlinePlacementResult,
} from '../scheduling/online-placement.port.ts';

export type ProductionSchedulerPort = Readonly<{
  forecastDemand: (input: DemandForecastInput) => DemandForecastOutput;
  propose: (input: SchedulingInput) => SchedulingOutput;
  proposeOnlinePlacement: (
    input: OnlinePlacementInput,
  ) => OnlinePlacementResult;
}>;

export type ProductionApplicationSchedulerPort = ProductionSchedulerPort &
  RemainingDayForecastSchedulerPort;
