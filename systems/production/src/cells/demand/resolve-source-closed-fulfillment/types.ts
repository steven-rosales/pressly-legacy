import type { CellOutcome } from '@pressly/cells';

export const resolveSourceClosedFulfillmentOperationId =
  'production.resolve-source-closed-fulfillment.v1' as const;

export type ProductionOrderResolutionCandidate = Readonly<{
  productionOrderId: string;
  locationId: string;
  productionVersion: number;
  resolutionState: string;
  sourceAdmissionState: 'unreleased' | 'released' | 'withdrawn';
  sourceCommercialState: 'open' | 'completed' | 'canceled';
}>;

export type ResolveSourceClosedFulfillmentCommand = Readonly<{
  /** Canonical Pressly fulfillment identity; never an adapter order key. */
  locationId: string;
  fulfillmentId: string;
  actorId: string;
  idempotencyKey: string;
}>;

export type SourceClosedFulfillmentReviewReason =
  | 'canonical_order_not_open'
  | 'fulfillment_not_unreleased'
  | 'resolution_state_invalid'
  | 'operational_review_required'
  | 'operational_participation'
  | 'concurrent_change';

export type ResolveSourceClosedFulfillmentResult =
  | Readonly<{
      outcome: 'resolved';
      locationId: string;
      fulfillmentId: string;
      productionOrderId: string;
      version: number;
      replayed: boolean;
    }>
  | Readonly<{
      outcome: 'not_found';
      locationId: string;
      fulfillmentId: string;
    }>
  | Readonly<{
      outcome: 'already_resolved';
      locationId: string;
      fulfillmentId: string;
      productionOrderId: string;
      version: number;
    }>
  | Readonly<{
      outcome: 'review_required';
      locationId: string;
      fulfillmentId: string;
      productionOrderId: string;
      version: number;
      reason: SourceClosedFulfillmentReviewReason;
    }>;

export type ResolveSourceClosedFulfillmentExpectedFailure = never;

export type ResolveSourceClosedFulfillmentDecision =
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{
      kind: 'already_resolved';
      candidate: ProductionOrderResolutionCandidate;
    }>
  | Readonly<{
      kind: 'review_required';
      candidate: ProductionOrderResolutionCandidate;
      reason: SourceClosedFulfillmentReviewReason;
    }>
  | Readonly<{
      kind: 'resolve';
      candidate: ProductionOrderResolutionCandidate;
    }>;

export type ResolveProductionOrderWithoutProductionCommand = Readonly<{
  locationId: string;
  productionOrderId: string;
  action: 'resolve_without_production';
  reason: 'order_will_not_be_produced';
  note: null;
  confirmReviewedFacts: false;
  sourceStatePrecondition: Readonly<{
    commercialState: 'open';
    admissionState: 'unreleased';
  }>;
  expectedVersion: number;
  idempotencyKey: string;
  actorId: string;
}>;

export type ResolveProductionOrderWithoutProductionResult = Readonly<{
  orderId: string;
  version: number;
  replayed: boolean;
}>;

export type ResolveProductionOrderWithoutProductionFailure = Readonly<{
  code: string;
}>;

/**
 * Narrow composition capability. The owning resolution cell may satisfy this
 * structurally, but this leaf never imports a sibling cell implementation.
 */
export type ResolveProductionOrderWithoutProduction = (
  command: ResolveProductionOrderWithoutProductionCommand,
) => Promise<
  CellOutcome<
    ResolveProductionOrderWithoutProductionResult,
    ResolveProductionOrderWithoutProductionFailure
  >
>;

export type ResolveSourceClosedFulfillmentRepository = Readonly<{
  findCandidate: (
    locationId: string,
    fulfillmentId: string,
  ) => Promise<ProductionOrderResolutionCandidate | null>;
}>;
