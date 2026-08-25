import type {
  ProductionOrderResolutionCandidate,
  ResolveSourceClosedFulfillmentDecision,
  SourceClosedFulfillmentReviewReason,
} from './types.ts';

/**
 * A source-close observation requests evaluation only. Canonical Production
 * resolution and admission state remain authoritative.
 */
export const decideSourceClosedFulfillment = (
  candidate: ProductionOrderResolutionCandidate | null,
): ResolveSourceClosedFulfillmentDecision => {
  if (candidate === null) return { kind: 'not_found' };
  if (candidate.resolutionState === 'resolved_without_production')
    return { kind: 'already_resolved', candidate };
  if (candidate.resolutionState !== 'open')
    return {
      kind: 'review_required',
      candidate,
      reason: 'resolution_state_invalid',
    };
  if (candidate.sourceCommercialState !== 'open')
    return {
      kind: 'review_required',
      candidate,
      reason: 'canonical_order_not_open',
    };
  if (candidate.sourceAdmissionState !== 'unreleased')
    return {
      kind: 'review_required',
      candidate,
      reason: 'fulfillment_not_unreleased',
    };
  return { kind: 'resolve', candidate };
};

export const reviewReasonForResolutionFailure = (
  code: string,
): SourceClosedFulfillmentReviewReason => {
  if (code === 'production_order_resolution_review_required')
    return 'operational_review_required';
  if (code === 'production_order_resolution_blocked')
    return 'operational_participation';
  return 'concurrent_change';
};
