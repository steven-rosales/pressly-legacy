import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';

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

export type ResolveSourceClosedFulfillment = (
  command: ResolveSourceClosedFulfillmentCommand,
) => Promise<Result<ResolveSourceClosedFulfillmentResult, AppError>>;
