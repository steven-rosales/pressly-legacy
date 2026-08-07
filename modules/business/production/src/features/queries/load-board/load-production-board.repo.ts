import type { Database } from '@pressly/db/client';
import type { LoadProductionBoardRepository } from './load-production-board.port.ts';
import { loadProductionBoardProjection } from '../../../foundations/adapters/postgres/board/production-board-read.adapter.ts';

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
