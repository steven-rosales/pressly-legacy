import type { Result } from '@pressly/kernel';
import type { ProductionOrderBacklogSnapshotReader } from '../../../foundations/ports/production-order-backlog-snapshot/production-order-backlog-snapshot.port.ts';
import type { ProductionFeatureFailure } from '../../../foundations/language/failures/production-feature.failure.ts';
import type { ProductionOrderBacklogScope } from '../../../foundations/language/production-order-backlog/production-order-backlog.model.ts';
import type { ProductionOrderBacklogPreview } from './preview-production-order-backlog.model.ts';

export type PreviewProductionOrderBacklog = (
  command: ProductionOrderBacklogScope,
) => Promise<Result<ProductionOrderBacklogPreview, ProductionFeatureFailure>>;

export type PreviewProductionOrderBacklogRepository = Readonly<{
  loadSnapshot: ProductionOrderBacklogSnapshotReader;
}>;
