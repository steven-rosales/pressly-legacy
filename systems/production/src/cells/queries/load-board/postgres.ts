import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type { PostgresDatabase } from '@pressly/postgres/client';
import { loadProductionBoardSnapshot } from '../../../read-models/production-board/postgres.ts';
import type { LoadBoardRepository } from './types.ts';

export const makeLoadBoardPostgresRepository = (
  database: PostgresDatabase,
  schema: ProductionSchema,
): LoadBoardRepository => ({
  load: (locationId, productionRunId, asOf) =>
    database.transaction(
      (transaction) =>
        loadProductionBoardSnapshot(
          transaction,
          locationId,
          productionRunId,
          asOf,
          schema,
        ),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    ),
});
