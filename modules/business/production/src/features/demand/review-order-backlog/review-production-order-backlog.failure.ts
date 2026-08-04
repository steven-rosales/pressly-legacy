import type { ProductionFeatureFailure } from '../../../foundations/language/failures/production-feature.failure.ts';

export type ReviewProductionOrderBacklogFailure = ProductionFeatureFailure;

export type ProductionOrderBacklogCursorFailure = Readonly<{
  code:
    | 'production_order_backlog_cursor_invalid'
    | 'production_order_backlog_cursor_scope_mismatch';
  message: string;
}>;
