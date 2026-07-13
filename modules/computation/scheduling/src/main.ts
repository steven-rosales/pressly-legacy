import { proposeSchedule } from './propose-schedule/propose-schedule.computation.ts';

export const makeProductionScheduler = () => ({ propose: proposeSchedule });

export type ProductionScheduler = ReturnType<typeof makeProductionScheduler>;
