import type { CellOutcome } from '@pressly/cells';
import type { ListProductionHistoryActivityResult } from '../../../read-models/production-history/contract.ts';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import {
  listHistoryActivityCursorInvalid,
  listHistoryActivityLocationNotFound,
} from './failures.ts';
import { projectHistoryActivityResult } from './project.ts';
import type {
  ListHistoryActivityClock,
  ListHistoryActivityExpectedFailure,
  ListHistoryActivityInput,
  ListHistoryActivityRepository,
} from './types.ts';

export type ListHistoryActivityDependencies = Readonly<{
  repo: ListHistoryActivityRepository;
  clock: ListHistoryActivityClock;
}>;

export type ExecuteListHistoryActivity = (
  input: ListHistoryActivityInput,
) => Promise<
  CellOutcome<
    ListProductionHistoryActivityResult,
    ListHistoryActivityExpectedFailure
  >
>;

const success = (
  value: ListProductionHistoryActivityResult,
): CellOutcome<
  ListProductionHistoryActivityResult,
  ListHistoryActivityExpectedFailure
> => ({ kind: 'success', value });

const failure = (
  value: ListHistoryActivityExpectedFailure,
): CellOutcome<
  ListProductionHistoryActivityResult,
  ListHistoryActivityExpectedFailure
> => ({ kind: 'failure', failure: value });

export const makeExecuteListHistoryActivity = (
  dependencies: ListHistoryActivityDependencies,
): ExecuteListHistoryActivity =>
  async function execute(input) {
    try {
      // Preserve the observable evaluation order: the clock is read
      // before the repository begins its repeatable-read transaction.
      const asOf = dependencies.clock.now();
      const loaded = await dependencies.repo.list(input, asOf);
      if (loaded.kind === 'location_not_found')
        return failure(listHistoryActivityLocationNotFound());
      if (loaded.kind === 'invalid_cursor')
        return failure(listHistoryActivityCursorInvalid());

      return success(projectHistoryActivityResult(loaded.page));
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_history_activity_list_failed',
          message: 'Production activity history could not be loaded.',
          safeMessage: 'Production activity history could not be loaded.',
          status: 503,
          cause,
        }),
      );
    }
  };
