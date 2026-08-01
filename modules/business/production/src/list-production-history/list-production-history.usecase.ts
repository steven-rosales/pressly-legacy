import { result } from '@pressly/kernel';
import { productionError } from '../failure-mapping/production.error.ts';
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
  productionError(
    'PRODUCTION_LOCATION_NOT_FOUND',
    'The production location was not found.',
    404,
  );

const invalidCursor = () =>
  productionError(
    'PRODUCTION_HISTORY_CURSOR_INVALID',
    'The production-history cursor is invalid for these filters.',
    400,
  );

export const makeListProductionHistory = (deps: {
  repo: ProductionHistoryRepository;
  clock: ClockPort;
}): ProductionHistoryApplication => {
  const listRuns: ListProductionHistoryRuns = async (command) => {
    const found = await deps.repo.listRuns(command, deps.clock.now());
    if (found.tag === 'location_not_found')
      return result.err(locationNotFound());
    if (found.tag === 'invalid_cursor') return result.err(invalidCursor());
    return result.ok(found.value);
  };

  const listActivity: ListProductionHistoryActivity = async (command) => {
    const found = await deps.repo.listActivity(command, deps.clock.now());
    if (found.tag === 'location_not_found')
      return result.err(locationNotFound());
    if (found.tag === 'invalid_cursor') return result.err(invalidCursor());
    return result.ok(found.value);
  };

  const listPlans: ListProductionHistoryPlans = async (command) => {
    const found = await deps.repo.listPlans(command, deps.clock.now());
    if (found.tag === 'location_not_found')
      return result.err(locationNotFound());
    if (found.tag === 'invalid_cursor') return result.err(invalidCursor());
    return result.ok(found.value);
  };

  const loadRun: LoadProductionHistoryRun = async (command) => {
    const found = await deps.repo.loadRun(command, deps.clock.now());
    if (found.tag === 'location_not_found')
      return result.err(locationNotFound());
    if (found.tag === 'run_not_found')
      return result.err(
        productionError(
          'PRODUCTION_HISTORY_RUN_NOT_FOUND',
          'The production run was not found at this location.',
          404,
        ),
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
