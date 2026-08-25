import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type {
  ResolveSourceLocationExpectedFailure,
  ResolveSourceLocationInput,
  ResolveSourceLocationRepository,
  ResolveSourceLocationResult,
} from './types.ts';

export const makeExecuteResolveSourceLocation =
  (repo: ResolveSourceLocationRepository) =>
  async (
    input: ResolveSourceLocationInput,
  ): Promise<
    CellOutcome<
      ResolveSourceLocationResult,
      ResolveSourceLocationExpectedFailure
    >
  > => {
    try {
      return { kind: 'success', value: await repo.resolve(input) };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'source_location_bindings_failed',
          message: 'Source-location bindings could not be managed.',
          safeMessage: 'Source-location bindings could not be managed.',
          status: 503,
          cause,
        }),
      );
    }
  };
