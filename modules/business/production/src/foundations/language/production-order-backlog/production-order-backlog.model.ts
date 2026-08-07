import type { ProductionOrderResolutionLifecycleDecision } from '../execution/production-lifecycle.model.ts';

export type ProductionOrderBacklogFilter = 'all_due_before_cutoff';
export type ProductionOrderBacklogCursor = string;

export type ProductionOrderBacklogResolutionReason =
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
  reason: ProductionOrderBacklogResolutionReason;
  cursor: ProductionOrderBacklogCursor | null;
  maxOrders: number;
}>;

export type ProductionOrderBacklogPreviewItem = Readonly<{
  orderId: string;
  displayReference: string;
  dueAt: string;
  category: ProductionOrderBacklogCategory;
  reasons: readonly ProductionOrderBacklogClassificationReason[];
  expectedVersion: number;
  expectedResolutionState: 'open' | 'resolved_without_production';
}>;

export type ProductionOrderBacklogSnapshotScope = Readonly<{
  locationId: string;
  filter: ProductionOrderBacklogFilter;
  cutoff: Date;
  maxOrders: number;
  after: Readonly<{
    dueAt: Date;
    orderId: string;
  }> | null;
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

export type ClassifiedProductionOrderBacklogOrder = Readonly<{
  snapshot: ProductionOrderBacklogSnapshotOrder;
  item: ProductionOrderBacklogPreviewItem;
  lifecycle: ProductionOrderResolutionLifecycleDecision | null;
}>;

export type ClassifiedProductionOrderBacklogSnapshot = Readonly<{
  orders: readonly ClassifiedProductionOrderBacklogOrder[];
  hasMore: boolean;
}>;
