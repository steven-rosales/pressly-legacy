import { result } from '@pressly/kernel';
import type { ClockPort } from '../command-execution/production-command.port.ts';
import { toProductionDatabaseResult } from '../persistence/production-database-result.error.ts';
import type {
  ListProductionLocations,
  ListProductionLocationsRepository,
} from './list-production-locations.port.ts';

export const makeListProductionLocations =
  (deps: {
    repo: ListProductionLocationsRepository;
    clock: ClockPort;
  }): ListProductionLocations =>
  async (command) => {
    const loaded = await toProductionDatabaseResult(
      'PRODUCTION_LOCATIONS_LIST_FAILED',
      'Production locations could not be loaded.',
      () => deps.repo.listLocations(command),
    );
    if (result.isErr(loaded)) return loaded;

    return result.ok({
      items: [...loaded.value],
      asOf: deps.clock.now().toISOString(),
    });
  };

export type {
  ListProductionLocations,
  ListProductionLocationsCommand,
  ListProductionLocationsRepository,
} from './list-production-locations.port.ts';
