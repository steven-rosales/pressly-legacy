import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type { PostgresExecutor } from '@pressly/postgres/client';
import { makeProductionOrderBacklogSnapshotReader } from '../../../read-models/production-order-backlog/postgres.ts';
import type { PreviewOrderBacklogRepository } from './types.ts';

export const makePreviewOrderBacklogPostgresRepository = (
  database: PostgresExecutor,
  schema: ProductionSchema,
): PreviewOrderBacklogRepository => ({
  loadSnapshot: makeProductionOrderBacklogSnapshotReader(database, schema),
});
