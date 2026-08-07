import type { Database } from '@pressly/db/client';
import { makeProductionOrderBacklogSnapshotReader } from '../../../foundations/adapters/postgres/production-order-backlog-snapshot/production-order-backlog-snapshot.repo.ts';
import type { PreviewProductionOrderBacklogRepository } from './preview-production-order-backlog.port.ts';

export const makePreviewProductionOrderBacklogRepository = (
  db: Database,
): PreviewProductionOrderBacklogRepository => ({
  loadSnapshot: makeProductionOrderBacklogSnapshotReader(db),
});
