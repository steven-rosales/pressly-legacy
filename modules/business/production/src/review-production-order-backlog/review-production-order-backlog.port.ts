import type {
  CommitProductionOrderBacklogCommand,
  PreviewProductionOrderBacklogCommand,
  ProductionOrderBacklogCommitResult,
  ProductionOrderBacklogFilter,
  ProductionOrderBacklogPreview,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  ProductionOrderResolutionLifecycleDecision,
  Transactional,
  WorkEventInput,
} from '../production.port.ts';

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
  sourceCommercialState: 'open' | 'completed' | 'canceled';
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

export type PreviewProductionOrderBacklog = (
  command: PreviewProductionOrderBacklogCommand,
) => Promise<Result<ProductionOrderBacklogPreview, AppError>>;

export type CommitProductionOrderBacklog = (
  command: CommitProductionOrderBacklogCommand & Readonly<{ actorId: string }>,
) => Promise<Result<ProductionOrderBacklogCommitResult, AppError>>;

type LoadSnapshot = (
  scope: BacklogSnapshotScope,
) => Promise<ProductionOrderBacklogSnapshot>;

export type ReviewProductionOrderBacklogTransaction = Readonly<{
  findWorkEvent: FindWorkEvent;
  lockLocationScheduling: (locationId: string) => Promise<void>;
  loadSnapshotForUpdate: LoadSnapshot;
  resolveOrder: (input: {
    locationId: string;
    orderId: string;
    actorId: string;
    expectedVersion: number;
    lifecycle: ProductionOrderResolutionLifecycleDecision;
    reason: CommitProductionOrderBacklogCommand['reason'];
    note: string | null;
    bulkOperationId: string;
    now: Date;
  }) => Promise<Readonly<{
    orderId: string;
    resolutionState: 'resolved_without_production';
    version: number;
  }> | null>;
  appendWorkEvent: (event: WorkEventInput) => Promise<void>;
}>;

export type ReviewProductionOrderBacklogRepository = Readonly<{
  loadSnapshot: LoadSnapshot;
}> &
  Transactional<ReviewProductionOrderBacklogTransaction>;
