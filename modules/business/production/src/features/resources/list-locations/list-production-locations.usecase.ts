import { result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import { withProductionDatabaseError } from '../../../foundations/adapters/postgres/commands/production-database-error.adapter.ts';
import type {
  ListProductionLocations,
  ListProductionLocationsRepository,
} from './list-production-locations.port.ts';

export const makeListProductionLocations =
  (deps: {
    repo: ListProductionLocationsRepository;
    clock: Clock;
  }): ListProductionLocations =>
  async (command) => {
    const locations = await withProductionDatabaseError(
      'PRODUCTION_LOCATIONS_LIST_FAILED',
      'Production locations could not be loaded.',
      () => deps.repo.listLocations(command),
    );
    return result.ok({
      items: [...locations],
      asOf: deps.clock.now(),
    });
  };
