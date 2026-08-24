import type { CellOutcome } from '@pressly/cells';
import type { ProductionHistoryRunDetail } from '../../../read-models/production-history/contract.ts';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import {
  loadHistoryRunLocationNotFound,
  loadHistoryRunNotFound,
} from './failures.ts';
import { projectHistoryRunDetailResult } from './project.ts';
import type {
  LoadHistoryRunClock,
  LoadHistoryRunExpectedFailure,
  LoadHistoryRunInput,
  LoadHistoryRunRepository,
} from './types.ts';

export type LoadHistoryRunDependencies = Readonly<{
  repo: LoadHistoryRunRepository;
  clock: LoadHistoryRunClock;
}>;

export type ExecuteLoadHistoryRun = (
  input: LoadHistoryRunInput,
) => Promise<
  CellOutcome<ProductionHistoryRunDetail, LoadHistoryRunExpectedFailure>
>;

const failure = (value: LoadHistoryRunExpectedFailure) => ({
  kind: 'failure' as const,
  failure: value,
});

export const makeExecuteLoadHistoryRun =
  (dependencies: LoadHistoryRunDependencies): ExecuteLoadHistoryRun =>
  async (input) => {
    try {
      const asOf = dependencies.clock.now();
      const loaded = await dependencies.repo.load(input, asOf);
      if (loaded.kind === 'location_not_found')
        return failure(loadHistoryRunLocationNotFound());
      if (loaded.kind === 'run_not_found')
        return failure(loadHistoryRunNotFound());
      return {
        kind: 'success',
        value: projectHistoryRunDetailResult(loaded.detail),
      };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_history_run_load_failed',
          message: 'The production run history could not be loaded.',
          safeMessage: 'The production run history could not be loaded.',
          status: 503,
          cause,
        }),
      );
    }
  };
