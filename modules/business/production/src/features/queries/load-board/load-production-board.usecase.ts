import { notFoundFailure } from '../../../foundations/language/failures/production-failure.factory.ts';
import { result } from '@pressly/kernel';
import { withProductionDatabaseError } from '../../../foundations/adapters/postgres/commands/production-database-error.adapter.ts';
import type { Clock } from '@pressly/time';
import type { ProductionRules } from '../../../foundations/language/rules/production-rules.factory.ts';
import type {
  LoadProductionBoard,
  LoadProductionBoardRepository,
} from './load-production-board.port.ts';
import { evaluateProductionBoardProjection } from '../../../foundations/language/board/production-board-read.policy.ts';
export type { LoadProductionBoard } from './load-production-board.port.ts';

export const makeLoadProductionBoard =
  (deps: {
    repo: LoadProductionBoardRepository;
    clock: Clock;
    policy: Pick<ProductionRules, 'evaluateStageNextAction'>;
  }): LoadProductionBoard =>
  async ({ locationId, productionRunId }) => {
    const now = deps.clock.now();
    const projection = await withProductionDatabaseError(
      'PRODUCTION_BOARD_LOAD_FAILED',
      'The production board could not be loaded.',
      () => deps.repo.loadBoardProjection(locationId, productionRunId, now),
    );
    if (projection === null)
      return result.err(
        notFoundFailure({
          code: 'production_board_not_found',
          message: 'The production board was not found.',
          safeMessage: 'The production board was not found.',
        }),
      );

    return result.ok(
      evaluateProductionBoardProjection(projection, deps.policy),
    );
  };
