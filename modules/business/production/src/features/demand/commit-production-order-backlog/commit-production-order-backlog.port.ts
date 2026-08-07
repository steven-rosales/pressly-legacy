import type { Result, ResultUnitOfWork } from '@pressly/kernel';
import type {
  FindWorkEvent,
  WorkEventInput,
} from '../../../foundations/language/commands/production-command.model.ts';
import type { ProductionOrderBacklogSnapshotReader } from '../../../foundations/ports/production-order-backlog-snapshot/production-order-backlog-snapshot.port.ts';
import type { ProductionFeatureFailure } from '../../../foundations/language/failures/production-feature.failure.ts';
import type {
  CommitProductionOrderBacklogCommand,
  ProductionOrderBacklogCommitResult,
  ResolveProductionOrderBacklogInput,
  ResolveProductionOrderBacklogResult,
} from './commit-production-order-backlog.model.ts';

export type CommitProductionOrderBacklog = (
  command: CommitProductionOrderBacklogCommand,
) => Promise<
  Result<ProductionOrderBacklogCommitResult, ProductionFeatureFailure>
>;

export type CommitProductionOrderBacklogTransaction = Readonly<{
  findWorkEvent: FindWorkEvent;
  lockLocationScheduling: (locationId: string) => Promise<void>;
  loadSnapshotForUpdate: ProductionOrderBacklogSnapshotReader;
  resolveOrder: (
    input: ResolveProductionOrderBacklogInput,
  ) => Promise<ResolveProductionOrderBacklogResult | null>;
  appendWorkEvent: (event: WorkEventInput) => Promise<void>;
}>;

export type CommitProductionOrderBacklogRepository =
  ResultUnitOfWork<CommitProductionOrderBacklogTransaction>;
