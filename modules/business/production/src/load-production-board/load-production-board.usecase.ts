import { result } from '@pressly/kernel';
import { productionError } from '../production.error.ts';
import type { ClockPort, ProductionPolicyPort } from '../production.port.ts';
import type {
  LoadProductionBoard,
  LoadProductionBoardRepository,
} from './load-production-board.port.ts';
import { evaluateProductionBoardProjection } from '../production-board-read.policy.ts';
export type { LoadProductionBoard } from './load-production-board.port.ts';

export const makeLoadProductionBoard =
  (deps: {
    repo: LoadProductionBoardRepository;
    clock: ClockPort;
    policy: ProductionPolicyPort;
  }): LoadProductionBoard =>
  async ({ locationId, productionRunId }) => {
    const now = deps.clock.now();
    const projection = await deps.repo.loadBoardProjection(
      locationId,
      productionRunId,
      now,
    );

    if (projection === null)
      return result.err(
        productionError(
          'PRODUCTION_BOARD_NOT_FOUND',
          'The production board was not found.',
          404,
        ),
      );

    return result.ok(
      evaluateProductionBoardProjection(projection, deps.policy),
    );
  };
