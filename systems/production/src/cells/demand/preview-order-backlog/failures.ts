import type { ProductionOrderBacklogCursorFailure } from '../../../read-models/production-order-backlog/model.ts';
import type { PreviewOrderBacklogExpectedFailure } from './types.ts';

export const previewOrderBacklogCursorInvalid = (
  failure: ProductionOrderBacklogCursorFailure,
): PreviewOrderBacklogExpectedFailure => ({
  tag: 'ProductionFailure',
  kind: 'validation',
  classification: 'malformed',
  code: 'production_order_backlog_cursor_invalid',
  message: failure.message,
  safeMessage: failure.message,
  details: { reason: failure.code },
});
