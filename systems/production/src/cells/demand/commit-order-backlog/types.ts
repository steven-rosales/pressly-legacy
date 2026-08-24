import type { ProductionOrderBacklogCursor } from '../../../read-models/production-order-backlog/contract.ts';
import type { ProductionOrderResolutionLifecycleDecision } from '../../../model/public.ts';
import type {
  ProductionOrderBacklogCursorFailure,
  ProductionOrderBacklogScope,
} from '../../../read-models/production-order-backlog/model.ts';

export const commitOrderBacklogOperationId =
  'production.commit-order-backlog.v1' as const;

export type CommitOrderBacklogCommand = ProductionOrderBacklogScope &
  Readonly<{
    actorId: string;
    note: string | null;
    previewHash: string;
    idempotencyKey: string;
  }>;

export type CommitOrderBacklogResolvedItem = Readonly<{
  orderId: string;
  resolutionState: 'resolved_without_production';
  version: number;
}>;

export type CommitOrderBacklogResult = Readonly<{
  locationId: string;
  bulkOperationId: string;
  previewHash: string;
  nextCursor: ProductionOrderBacklogCursor | null;
  resolvedCount: number;
  resolved: readonly CommitOrderBacklogResolvedItem[];
  committedAt: string;
  replayed: boolean;
}>;

export type CommitOrderBacklogCursorInvalid = Readonly<{
  tag: 'ProductionFailure';
  kind: 'validation';
  classification: 'malformed';
  code: 'production_order_backlog_cursor_invalid';
  message: string;
  safeMessage: string;
  details: Readonly<{ reason: ProductionOrderBacklogCursorFailure['code'] }>;
}>;

export type CommitOrderBacklogConflict = Readonly<{
  tag: 'ProductionFailure';
  kind: 'conflict';
  code:
    | 'production_idempotency_conflict'
    | 'production_order_backlog_preview_stale'
    | 'production_order_backlog_commit_conflict';
  message: string;
  safeMessage: string;
}>;

export type CommitOrderBacklogExpectedFailure =
  | CommitOrderBacklogCursorInvalid
  | CommitOrderBacklogConflict;

export type ResolveCommitOrderBacklogInput = Readonly<{
  locationId: string;
  orderId: string;
  actorId: string;
  expectedVersion: number;
  lifecycle: ProductionOrderResolutionLifecycleDecision;
  reason: CommitOrderBacklogCommand['reason'];
  note: string | null;
  bulkOperationId: string;
  now: Date;
}>;
