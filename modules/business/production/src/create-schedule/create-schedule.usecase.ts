import { result } from '@pressly/kernel';
import { productionError } from '../production.error.ts';
import type {
  ClockPort,
  IdPort,
  ProductionSchedulerPort,
} from '../production.port.ts';
import type {
  CreateSchedule,
  CreateScheduleRepository,
} from './create-schedule.port.ts';
export type { CreateSchedule } from './create-schedule.port.ts';

export const makeCreateSchedule =
  (deps: {
    repo: CreateScheduleRepository;
    scheduler: ProductionSchedulerPort;
    clock: ClockPort;
    ids: IdPort;
  }): CreateSchedule =>
  async (command) => {
    try {
      return await deps.repo.transaction(async (repo) => {
        const schedulingInput = await repo.loadSchedulingInput(command);

        if (schedulingInput === null)
          return result.err(
            productionError(
              'SCHEDULING_INPUT_NOT_FOUND',
              'The shift or scheduler configuration was not found.',
              404,
            ),
          );

        const output = deps.scheduler.propose(schedulingInput);
        const schedule = await repo.saveSchedule({
          locationId: command.locationId,
          id: deps.ids.next(),
          schedulingInput,
          output,
          now: deps.clock.now(),
        });

        return result.ok(schedule);
      });
    } catch (error) {
      return result.err(
        productionError(
          'SCHEDULE_CREATE_FAILED',
          'The schedule proposal could not be created.',
          500,
          error,
        ),
      );
    }
  };
