import type { ProductionOrderBacklogCursorFailure } from '../../../read-models/production-order-backlog/model.ts';
import type {
  CommitOrderBacklogConflict,
  CommitOrderBacklogCursorInvalid,
} from './types.ts';

export const commitOrderBacklogCursorInvalid = (
  failure: ProductionOrderBacklogCursorFailure,
): CommitOrderBacklogCursorInvalid => ({
  tag: 'ProductionFailure',
  kind: 'validation',
  classification: 'malformed',
  code: 'production_order_backlog_cursor_invalid',
  message: failure.message,
  safeMessage: failure.message,
  details: { reason: failure.code },
});

export const commitOrderBacklogIdempotencyConflict =
  (): CommitOrderBacklogConflict => ({
    tag: 'ProductionFailure',
    kind: 'conflict',
    code: 'production_idempotency_conflict',
    message: 'The idempotency key belongs to a different production command.',
    safeMessage:
      'The idempotency key belongs to a different production command.',
  });

export const commitOrderBacklogPreviewStale =
  (): CommitOrderBacklogConflict => ({
    tag: 'ProductionFailure',
    kind: 'conflict',
    code: 'production_order_backlog_preview_stale',
    message:
      'The old-order backlog changed after it was reviewed. Refresh the preview before committing.',
    safeMessage:
      'The old-order backlog changed after it was reviewed. Refresh the preview before committing.',
  });

export const commitOrderBacklogWriteConflict =
  (): CommitOrderBacklogConflict => ({
    tag: 'ProductionFailure',
    kind: 'conflict',
    code: 'production_order_backlog_commit_conflict',
    message:
      'An order changed while the old-order backlog was being committed. No orders were archived.',
    safeMessage:
      'An order changed while the old-order backlog was being committed. No orders were archived.',
  });
