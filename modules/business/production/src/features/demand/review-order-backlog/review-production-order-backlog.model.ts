import type { ProductionOrderResolutionLifecycleDecision } from '../../../foundations/language/execution/production-lifecycle.model.ts';

export type ProductionOrderBacklogFilter = 'all_due_before_cutoff';

/**
 * The cursor stays opaque to callers. Its bytes are owned by this capability
 * because the checksum is part of the established pagination protocol.
 */
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

type ProductionOrderBacklogScope = Readonly<{
  locationId: string;
  filter: ProductionOrderBacklogFilter;
  cutoff: string;
  reason: ProductionOrderBacklogResolutionReason;
  cursor: ProductionOrderBacklogCursor | null;
  maxOrders: number;
}>;

export type PreviewProductionOrderBacklogCommand = ProductionOrderBacklogScope;

export type CommitProductionOrderBacklogCommand = ProductionOrderBacklogScope &
  Readonly<{
    actorId: string;
    note: string | null;
    previewHash: string;
    idempotencyKey: string;
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

export type ProductionOrderBacklogPreview = Readonly<{
  locationId: string;
  filter: ProductionOrderBacklogFilter;
  cutoff: string;
  reason: ProductionOrderBacklogResolutionReason;
  maxOrders: number;
  candidateCount: number;
  hasMore: boolean;
  cursor: ProductionOrderBacklogCursor | null;
  nextCursor: ProductionOrderBacklogCursor | null;
  previewHash: string;
  generatedAt: string;
  groups: Readonly<{
    readyToArchive: readonly ProductionOrderBacklogPreviewItem[];
    reviewIndividually: readonly ProductionOrderBacklogPreviewItem[];
    keptForSafety: readonly ProductionOrderBacklogPreviewItem[];
    alreadyHistorical: readonly ProductionOrderBacklogPreviewItem[];
  }>;
}>;

export type ProductionOrderBacklogResolvedItem = Readonly<{
  orderId: string;
  resolutionState: 'resolved_without_production';
  version: number;
}>;

/**
 * `committedAt` remains canonical ISO text because this complete result is
 * persisted as idempotency JSON and may be returned later from replay.
 */
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

export type BacklogSnapshotScope = Readonly<{
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
