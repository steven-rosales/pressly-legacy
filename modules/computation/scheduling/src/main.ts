import { forecastDemand } from './forecast-demand/forecast-demand.computation.ts';
import { proposeOnlinePlacement } from './online-placement/online-placement.computation.ts';
import { proposeSchedule } from './propose-schedule/propose-schedule.computation.ts';
import { makeRemainingDayForecastProjection } from './remaining-day-forecast/remaining-day-forecast.computation.ts';

export const makeProductionScheduler = () => ({
  forecastDemand,
  propose: proposeSchedule,
  proposeOnlinePlacement,
  projectRemainingDayForecast: makeRemainingDayForecastProjection(
    proposeOnlinePlacement,
  ),
});

export type ProductionScheduler = ReturnType<typeof makeProductionScheduler>;
