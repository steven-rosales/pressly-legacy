import type { CellOutcome } from '@pressly/cells';
import type { ListProductionOrderControlResult } from '../../../read-models/production-order-control/contract.ts';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import {
  listOrderControlCursorInvalid,
  listOrderControlLocationNotFound,
} from './failures.ts';
import { projectOrderControlResult } from './project.ts';
import type {
  ListOrderControlExpectedFailure,
  ListOrderControlInput,
  ListOrderControlRepository,
} from './types.ts';

export type ListOrderControlDependencies = Readonly<{
  repo: ListOrderControlRepository;
  clock: Readonly<{ now: () => Date }>;
}>;

export type ExecuteListOrderControl = (
  input: ListOrderControlInput,
) => Promise<
  CellOutcome<ListProductionOrderControlResult, ListOrderControlExpectedFailure>
>;

const failure = (value: ListOrderControlExpectedFailure) => ({
  kind: 'failure' as const,
  failure: value,
});

export const makeExecuteListOrderControl =
  (dependencies: ListOrderControlDependencies): ExecuteListOrderControl =>
  async (input) => {
    try {
      const asOf = dependencies.clock.now();
      const loaded = await dependencies.repo.list(input, asOf);
      if (loaded.kind === 'location_not_found')
        return failure(listOrderControlLocationNotFound());
      if (loaded.kind === 'invalid_cursor')
        return failure(listOrderControlCursorInvalid());
      return {
        kind: 'success',
        value: projectOrderControlResult(loaded.result),
      };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_order_control_list_failed',
          message: 'Production order control data could not be loaded.',
          safeMessage: 'Production order control data could not be loaded.',
          status: 503,
          cause,
        }),
      );
    }
  };
