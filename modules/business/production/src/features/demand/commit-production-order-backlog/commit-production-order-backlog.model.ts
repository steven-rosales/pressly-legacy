import type { ProductionOrderResolutionLifecycleDecision } from '../../../foundations/language/execution/production-lifecycle.model.ts';
import type {
  ProductionOrderBacklogCursor,
  ProductionOrderBacklogResolutionReason,
  ProductionOrderBacklogScope,
} from '../../../foundations/language/production-order-backlog/production-order-backlog.model.ts';

export type CommitProductionOrderBacklogCommand = ProductionOrderBacklogScope &
  Readonly<{
    actorId: string;
    note: string | null;
    previewHash: string;
    idempotencyKey: string;
  }>;

export type ProductionOrderBacklogResolvedItem = Readonly<{
  orderId: string;
  resolutionState: 'resolved_without_production';
  version: number;
}>;

export type ProductionOrderBacklogCommitResult = Readonly<{
  locationId: string;
  bulkOperationId: string;
  previewHash: string;
  nextCursor: ProductionOrderBacklogCursor | null;
  resolvedCount: number;
  resolved: readonly ProductionOrderBacklogResolvedItem[];
  committedAt: string;
  replayed: boolean;
}>;

export type ResolveProductionOrderBacklogInput = Readonly<{
  locationId: string;
  orderId: string;
  actorId: string;
  expectedVersion: number;
  lifecycle: ProductionOrderResolutionLifecycleDecision;
  reason: ProductionOrderBacklogResolutionReason;
  note: string | null;
  bulkOperationId: string;
  now: Date;
}>;

export type ResolveProductionOrderBacklogResult = Readonly<{
  orderId: string;
  resolutionState: 'resolved_without_production';
  version: number;
}>;
