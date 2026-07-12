import { result } from '@pressly/kernel';
import type { ClockPort } from '../production.port.ts';
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
    const locations = await deps.repo.listLocations(command);

    return result.ok({
      items: [...locations],
      asOf: deps.clock.now().toISOString(),
    });
  };

export type {
  ListProductionLocations,
  ListProductionLocationsCommand,
  ListProductionLocationsRepository,
} from './list-production-locations.port.ts';
