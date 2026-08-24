import type { ProductionOrderBacklogCursor } from './contract.ts';
import type {
  ProductionOrderResolutionLifecycleDecision,
  ProductionRules,
} from '../../model/public.ts';

export type ProductionOrderBacklogFilter = 'all_due_before_cutoff';
export type ProductionOrderBacklogReason =
  | 'completed_outside_pressly'
  | 'processor_not_in_use'
  | 'duplicate_or_test'
  | 'order_will_not_be_produced'
  | 'other';
export type ProductionOrderBacklogCategory =
  | 'ready_to_archive'
  | 'review_individually'
  | 'kept_for_safety'
  | 'already_historical';
export type ProductionOrderBacklogClassificationReason =
  | 'resolved_without_production'
  | 'execution_finished'
  | 'execution_state_invalid'
  | 'resolution_transition_invalid'
  | 'execution_committed'
  | 'selected_for_shift'
  | 'batch_membership_exists'
  | 'stage_attempt_exists'
  | 'route_exists'
  | 'intake_recorded'
  | 'manual_admission'
  | 'priority'
  | 'pending_placement'
  | 'no_operator_owned_facts';

export type ProductionOrderBacklogScope = Readonly<{
  locationId: string;
  filter: ProductionOrderBacklogFilter;
  cutoff: string;
  reason: ProductionOrderBacklogReason;
  cursor: ProductionOrderBacklogCursor | null;
  maxOrders: number;
}>;

export type ProductionOrderBacklogCursorPoint = Readonly<{
  dueAt: Date;
  orderId: string;
}>;

export type ProductionOrderBacklogCursorFailure = Readonly<{
  code:
    | 'production_order_backlog_cursor_invalid'
    | 'production_order_backlog_cursor_scope_mismatch';
  message: string;
}>;

export type ProductionOrderBacklogCursorCodec = Readonly<{
  encode: (
    input: Pick<
      ProductionOrderBacklogScope,
      'locationId' | 'filter' | 'cutoff' | 'reason'
    >,
    point: ProductionOrderBacklogCursorPoint,
  ) => ProductionOrderBacklogCursor;
  decode: (
    cursor: ProductionOrderBacklogCursor | null,
    input: Pick<
      ProductionOrderBacklogScope,
      'locationId' | 'filter' | 'cutoff' | 'reason'
    >,
  ) =>
    | Readonly<{
        kind: 'valid';
        point: ProductionOrderBacklogCursorPoint | null;
      }>
    | Readonly<{
        kind: 'invalid';
        failure: ProductionOrderBacklogCursorFailure;
      }>;
}>;

export type ProductionOrderBacklogSnapshotScope = Readonly<{
  locationId: string;
  filter: ProductionOrderBacklogFilter;
  cutoff: Date;
  maxOrders: number;
  after: ProductionOrderBacklogCursorPoint | null;
}>;

export type ProductionOrderBacklogSnapshotOrder = Readonly<{
  orderId: string;
  locationId: string;
  displayReference: string;
  dueAt: Date;
  productionVersion: number;
  resolutionState: 'open' | 'resolved_without_production';
  executionStatus: string;
  operationalStatus: string;
  hasIntake: boolean;
  hasManualAdmission: boolean;
  isPriority: boolean;
  hasPendingPlacement: boolean;
  hasShiftSelection: boolean;
  hasBatchMembership: boolean;
  hasStageAttempt: boolean;
  hasRoute: boolean;
}>;

export type ProductionOrderBacklogSnapshot = Readonly<{
  orders: readonly ProductionOrderBacklogSnapshotOrder[];
  hasMore: boolean;
}>;

export type ProductionOrderBacklogItem = Readonly<{
  orderId: string;
  displayReference: string;
  dueAt: string;
  category: ProductionOrderBacklogCategory;
  reasons: readonly ProductionOrderBacklogClassificationReason[];
  expectedVersion: number;
  expectedResolutionState: 'open' | 'resolved_without_production';
}>;

export type ClassifiedProductionOrderBacklogOrder = Readonly<{
  snapshot: ProductionOrderBacklogSnapshotOrder;
  item: ProductionOrderBacklogItem;
  lifecycle: ProductionOrderResolutionLifecycleDecision | null;
}>;

export type ClassifiedProductionOrderBacklogSnapshot = Readonly<{
  orders: readonly ClassifiedProductionOrderBacklogOrder[];
  hasMore: boolean;
}>;

export type ProductionOrderBacklogPolicy = Pick<
  ProductionRules,
  | 'resolveProductionOrderExecutionState'
  | 'evaluateProductionOrderResolutionTransition'
  | 'evaluateProductionOrderResolutionGuard'
>;

export type ProductionOrderBacklogSnapshotReader = (
  input: ProductionOrderBacklogSnapshotScope,
) => Promise<ProductionOrderBacklogSnapshot>;
