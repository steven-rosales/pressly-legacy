import type { CellOutcome } from '@pressly/cells';
import type { ListProductionHistoryPlansResult } from '../../../read-models/production-history/contract.ts';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import {
  listHistoryPlansCursorInvalid,
  listHistoryPlansLocationNotFound,
} from './failures.ts';
import { projectHistoryPlansResult } from './project.ts';
import type {
  ListHistoryPlansClock,
  ListHistoryPlansExpectedFailure,
  ListHistoryPlansInput,
  ListHistoryPlansRepository,
} from './types.ts';

export type ListHistoryPlansDependencies = Readonly<{
  repo: ListHistoryPlansRepository;
  clock: ListHistoryPlansClock;
}>;

export type ExecuteListHistoryPlans = (
  input: ListHistoryPlansInput,
) => Promise<
  CellOutcome<ListProductionHistoryPlansResult, ListHistoryPlansExpectedFailure>
>;

const success = (
  value: ListProductionHistoryPlansResult,
): CellOutcome<
  ListProductionHistoryPlansResult,
  ListHistoryPlansExpectedFailure
> => ({ kind: 'success', value });

const failure = (
  value: ListHistoryPlansExpectedFailure,
): CellOutcome<
  ListProductionHistoryPlansResult,
  ListHistoryPlansExpectedFailure
> => ({ kind: 'failure', failure: value });

export const makeExecuteListHistoryPlans =
  (dependencies: ListHistoryPlansDependencies): ExecuteListHistoryPlans =>
  async (input) => {
    try {
      const asOf = dependencies.clock.now();
      const loaded = await dependencies.repo.list(input, asOf);
      if (loaded.kind === 'location_not_found')
        return failure(listHistoryPlansLocationNotFound());
      if (loaded.kind === 'invalid_cursor')
        return failure(listHistoryPlansCursorInvalid());

      return success(projectHistoryPlansResult(loaded.page));
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_history_plans_list_failed',
          message: 'Production plan history could not be loaded.',
          safeMessage: 'Production plan history could not be loaded.',
          status: 503,
          cause,
        }),
      );
    }
  };
