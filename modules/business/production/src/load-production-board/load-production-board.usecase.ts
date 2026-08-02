import { notFoundError } from '@pressly/errors';
import { result } from '@pressly/kernel';
import { toProductionDatabaseResult } from '../persistence/production-database-result.error.ts';
import type { ClockPort } from '../command-execution/production-command.port.ts';
import type { ProductionPolicyPort } from '../production-policy/production-policy.port.ts';
import type {
  LoadProductionBoard,
  LoadProductionBoardRepository,
} from './load-production-board.port.ts';
import { evaluateProductionBoardProjection } from '../production-policy/production-board-read.policy.ts';
export type { LoadProductionBoard } from './load-production-board.port.ts';

export const makeLoadProductionBoard =
  (deps: {
    repo: LoadProductionBoardRepository;
    clock: ClockPort;
    policy: Pick<ProductionPolicyPort, 'evaluateStageNextAction'>;
  }): LoadProductionBoard =>
  async ({ locationId, productionRunId }) => {
    const now = deps.clock.now();
    const loaded = await toProductionDatabaseResult(
      'PRODUCTION_BOARD_LOAD_FAILED',
      'The production board could not be loaded.',
      () => deps.repo.loadBoardProjection(locationId, productionRunId, now),
    );
    if (result.isErr(loaded)) return loaded;
    const projection = loaded.value;

    if (projection === null)
      return result.err(
        notFoundError({
          code: 'production_board_not_found',
          message: 'The production board was not found.',
          safeMessage: 'The production board was not found.',
        }),
      );

    return result.ok(
      evaluateProductionBoardProjection(projection, deps.policy),
    );
  };
