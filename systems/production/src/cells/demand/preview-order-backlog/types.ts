import type {
  ProductionOrderBacklogCursorFailure,
  ProductionOrderBacklogSnapshotReader,
} from '../../../read-models/production-order-backlog/model.ts';

export const previewOrderBacklogOperationId =
  'production.preview-order-backlog.v1' as const;

export type PreviewOrderBacklogRepository = Readonly<{
  loadSnapshot: ProductionOrderBacklogSnapshotReader;
}>;

export type PreviewOrderBacklogExpectedFailure = Readonly<{
  tag: 'ProductionFailure';
  kind: 'validation';
  classification: 'malformed';
  code: 'production_order_backlog_cursor_invalid';
  message: string;
  safeMessage: string;
  details: Readonly<{ reason: ProductionOrderBacklogCursorFailure['code'] }>;
}>;
