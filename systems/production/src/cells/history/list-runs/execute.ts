import type { CellOutcome } from '@pressly/cells';
import type { ListProductionHistoryRunsResult } from '../../../read-models/production-history/contract.ts';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import {
  listHistoryRunsCursorInvalid,
  listHistoryRunsLocationNotFound,
} from './failures.ts';
import { projectHistoryRunsResult } from './project.ts';
import type {
  ListHistoryRunsClock,
  ListHistoryRunsExpectedFailure,
  ListHistoryRunsInput,
  ListHistoryRunsRepository,
} from './types.ts';

export type ListHistoryRunsDependencies = Readonly<{
  repo: ListHistoryRunsRepository;
  clock: ListHistoryRunsClock;
}>;

const failure = (failure: ListHistoryRunsExpectedFailure) => ({
  kind: 'failure' as const,
  failure,
});

export const makeExecuteListHistoryRuns =
  (dependencies: ListHistoryRunsDependencies) =>
  async (
    input: ListHistoryRunsInput,
  ): Promise<
    CellOutcome<ListProductionHistoryRunsResult, ListHistoryRunsExpectedFailure>
  > => {
    try {
      const asOf = dependencies.clock.now();
      const loaded = await dependencies.repo.list(input, asOf);
      if (loaded.kind === 'location_not_found')
        return failure(listHistoryRunsLocationNotFound());
      if (loaded.kind === 'invalid_cursor')
        return failure(listHistoryRunsCursorInvalid());
      return {
        kind: 'success',
        value: projectHistoryRunsResult(loaded.page),
      };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_history_runs_list_failed',
          message: 'Production run history could not be loaded.',
          safeMessage: 'Production run history could not be loaded.',
          status: 503,
          cause,
        }),
      );
    }
  };
