import type { CellOutcome } from '@pressly/cells';
import type { ProductionBoard as ProductionBoardResult } from '../../../read-models/production-board/contract.ts';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { BoardPolicy } from '../../../read-models/production-board/model.ts';
import {
  evaluateBoardProjection,
  serializeBoard,
} from '../../../read-models/production-board/project.ts';
import { loadBoardNotFound } from './failures.ts';
import type {
  LoadBoardClock,
  LoadBoardExpectedFailure,
  LoadBoardInput,
  LoadBoardRepository,
} from './types.ts';

export type LoadBoardDependencies = Readonly<{
  repo: LoadBoardRepository;
  clock: LoadBoardClock;
  policy: BoardPolicy;
}>;

export type ExecuteLoadBoard = (
  input: LoadBoardInput,
) => Promise<CellOutcome<ProductionBoardResult, LoadBoardExpectedFailure>>;

export const makeExecuteLoadBoard = (
  dependencies: LoadBoardDependencies,
): ExecuteLoadBoard =>
  async function execute(input) {
    try {
      // Preserve observable ordering: read the one asOf instant
      // before opening the read-only repeatable-read snapshot.
      const asOf = dependencies.clock.now();
      const projection = await dependencies.repo.load(
        input.locationId,
        input.productionRunId,
        asOf,
      );
      if (projection === null)
        return { kind: 'failure', failure: loadBoardNotFound() };

      return {
        kind: 'success',
        value: serializeBoard(
          evaluateBoardProjection(projection, dependencies.policy),
        ),
      };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_board_load_failed',
          message: 'The production board could not be loaded.',
          safeMessage: 'The production board could not be loaded.',
          status: 503,
          cause,
        }),
      );
    }
  };
