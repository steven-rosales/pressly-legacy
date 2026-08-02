import { notFoundError, validationError } from '@pressly/errors';
import { result } from '@pressly/kernel';
import { toProductionDatabaseResult } from '../persistence/production-database-result.error.ts';
import type { ClockPort } from '../command-execution/production-command.port.ts';
import type {
  ListProductionHistoryActivity,
  ListProductionHistoryPlans,
  ListProductionHistoryRuns,
  LoadProductionHistoryRun,
  ProductionHistoryApplication,
  ProductionHistoryRepository,
} from './list-production-history.port.ts';

const locationNotFound = () =>
  notFoundError({
    code: 'production_location_not_found',
    message: 'The production location was not found.',
    safeMessage: 'The production location was not found.',
  });

const invalidCursor = () =>
  validationError({
    code: 'production_history_cursor_invalid',
    message: 'The production-history cursor is invalid for these filters.',
    safeMessage: 'The production-history cursor is invalid for these filters.',
  });

export const makeListProductionHistory = (deps: {
  repo: ProductionHistoryRepository;
  clock: ClockPort;
}): ProductionHistoryApplication => {
  const listRuns: ListProductionHistoryRuns = async (command) => {
    const loaded = await toProductionDatabaseResult(
      'PRODUCTION_HISTORY_RUNS_LIST_FAILED',
      'Production run history could not be loaded.',
      () => deps.repo.listRuns(command, deps.clock.now()),
    );
    if (result.isErr(loaded)) return loaded;
    const found = loaded.value;
    if (found.tag === 'location_not_found')
      return result.err(locationNotFound());
    if (found.tag === 'invalid_cursor') return result.err(invalidCursor());
    return result.ok(found.value);
  };

  const listActivity: ListProductionHistoryActivity = async (command) => {
    const loaded = await toProductionDatabaseResult(
      'PRODUCTION_HISTORY_ACTIVITY_LIST_FAILED',
      'Production activity history could not be loaded.',
      () => deps.repo.listActivity(command, deps.clock.now()),
    );
    if (result.isErr(loaded)) return loaded;
    const found = loaded.value;
    if (found.tag === 'location_not_found')
      return result.err(locationNotFound());
    if (found.tag === 'invalid_cursor') return result.err(invalidCursor());
    return result.ok(found.value);
  };

  const listPlans: ListProductionHistoryPlans = async (command) => {
    const loaded = await toProductionDatabaseResult(
      'PRODUCTION_HISTORY_PLANS_LIST_FAILED',
      'Production plan history could not be loaded.',
      () => deps.repo.listPlans(command, deps.clock.now()),
    );
    if (result.isErr(loaded)) return loaded;
    const found = loaded.value;
    if (found.tag === 'location_not_found')
      return result.err(locationNotFound());
    if (found.tag === 'invalid_cursor') return result.err(invalidCursor());
    return result.ok(found.value);
  };

  const loadRun: LoadProductionHistoryRun = async (command) => {
    const loaded = await toProductionDatabaseResult(
      'PRODUCTION_HISTORY_RUN_LOAD_FAILED',
      'The production run history could not be loaded.',
      () => deps.repo.loadRun(command, deps.clock.now()),
    );
    if (result.isErr(loaded)) return loaded;
    const found = loaded.value;
    if (found.tag === 'location_not_found')
      return result.err(locationNotFound());
    if (found.tag === 'run_not_found')
      return result.err(
        notFoundError({
          code: 'production_history_run_not_found',
          message: 'The production run was not found at this location.',
          safeMessage: 'The production run was not found at this location.',
        }),
      );
    return result.ok(found.value);
  };

  return { listRuns, listActivity, listPlans, loadRun };
};

export type {
  ListProductionHistoryActivity,
  ListProductionHistoryActivityCommand,
  ListProductionHistoryPlans,
  ListProductionHistoryPlansCommand,
  ListProductionHistoryRuns,
  ListProductionHistoryRunsCommand,
  LoadProductionHistoryRun,
  LoadProductionHistoryRunCommand,
  ProductionHistoryApplication,
  ProductionHistoryRepository,
} from './list-production-history.port.ts';
