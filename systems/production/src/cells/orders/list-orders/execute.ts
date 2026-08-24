import type { CellOutcome } from '@pressly/cells';
import type { ListProductionOrdersResult } from './boundary.ts';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import {
  listOrdersCursorInvalid,
  listOrdersLocationNotFound,
} from './failures.ts';
import { projectOrdersResult } from './project.ts';
import type {
  ListOrdersClock,
  ListOrdersExpectedFailure,
  ListOrdersInput,
  ListOrdersRepository,
} from './types.ts';

export type ListOrdersDependencies = Readonly<{
  repo: ListOrdersRepository;
  clock: ListOrdersClock;
}>;

const failure = (failure: ListOrdersExpectedFailure) => ({
  kind: 'failure' as const,
  failure,
});

export const makeExecuteListOrders =
  (dependencies: ListOrdersDependencies) =>
  async (
    input: ListOrdersInput,
  ): Promise<
    CellOutcome<ListProductionOrdersResult, ListOrdersExpectedFailure>
  > => {
    try {
      const asOf = dependencies.clock.now();
      const loaded = await dependencies.repo.list(input, asOf);
      if (loaded.kind === 'location_not_found')
        return failure(listOrdersLocationNotFound());
      if (loaded.kind === 'invalid_cursor')
        return failure(listOrdersCursorInvalid());
      return { kind: 'success', value: projectOrdersResult(loaded.page) };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_order_list_failed',
          message: 'Production orders could not be loaded.',
          safeMessage: 'Production orders could not be loaded.',
          status: 503,
          cause,
        }),
      );
    }
  };
