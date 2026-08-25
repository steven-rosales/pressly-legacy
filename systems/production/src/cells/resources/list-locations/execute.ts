import type { CellOutcome } from '@pressly/cells';
import type { ListProductionLocationsResult } from './boundary.ts';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { projectLocationsResult } from './project.ts';
import type {
  ListLocationsClock,
  ListLocationsExpectedFailure,
  ListLocationsInput,
  ListLocationsRepository,
} from './types.ts';

export type ListLocationsDependencies = Readonly<{
  repo: ListLocationsRepository;
  clock: ListLocationsClock;
}>;

export const makeExecuteListLocations =
  (dependencies: ListLocationsDependencies) =>
  async (
    input: ListLocationsInput,
  ): Promise<
    CellOutcome<ListProductionLocationsResult, ListLocationsExpectedFailure>
  > => {
    let items;
    try {
      items = await dependencies.repo.list(input);
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_locations_list_failed',
          message: 'Production locations could not be loaded.',
          safeMessage: 'Production locations could not be loaded.',
          status: 503,
          cause,
        }),
      );
    }

    return {
      kind: 'success',
      value: projectLocationsResult({
        items,
        // Observe the response timestamp only after the list returns.
        asOf: dependencies.clock.now(),
      }),
    };
  };
