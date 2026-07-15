import { proposeOnlinePlacement } from './online-placement/online-placement.computation.ts';
import { proposeSchedule } from './propose-schedule/propose-schedule.computation.ts';

export const makeProductionScheduler = () => ({
  propose: proposeSchedule,
  proposeOnlinePlacement,
});

export type ProductionScheduler = ReturnType<typeof makeProductionScheduler>;
