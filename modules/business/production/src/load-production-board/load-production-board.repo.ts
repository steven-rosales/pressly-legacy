import type { Database } from '@pressly/db';
import type { LoadProductionBoardRepository } from './load-production-board.port.ts';
import { loadProductionBoardProjection } from '../persistence/production-board-read.ts';

export const makeLoadProductionBoardRepository = (deps: {
  db: Database;
}): LoadProductionBoardRepository => ({
  loadBoardProjection: (locationId, productionRunId, now) =>
    deps.db.transaction(
      (transaction) =>
        loadProductionBoardProjection(
          transaction,
          locationId,
          productionRunId,
          now,
        ),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    ),
});
