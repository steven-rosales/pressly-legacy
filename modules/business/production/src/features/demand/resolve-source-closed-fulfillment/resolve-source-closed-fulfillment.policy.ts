import type {
  ProductionOrderResolutionCandidate,
  SourceClosedFulfillmentReviewReason,
} from './resolve-source-closed-fulfillment.model.ts';

export type SourceClosedFulfillmentPreflight =
  | Readonly<{ decision: 'not_found' }>
  | Readonly<{
      decision: 'already_resolved';
      candidate: ProductionOrderResolutionCandidate;
    }>
  | Readonly<{
      decision: 'review_required';
      candidate: ProductionOrderResolutionCandidate;
      reason: SourceClosedFulfillmentReviewReason;
    }>
  | Readonly<{
      decision: 'ready';
      candidate: ProductionOrderResolutionCandidate;
    }>;

/**
 * A source-close observation is only a request to evaluate untouched Pressly
 * work. Canonical state and admission remain authoritative inputs.
 */
export const classifySourceClosedFulfillment = (
  candidate: ProductionOrderResolutionCandidate | null,
): SourceClosedFulfillmentPreflight => {
  if (candidate === null) return { decision: 'not_found' };
  if (candidate.resolutionState === 'resolved_without_production')
    return { decision: 'already_resolved', candidate };
  if (candidate.resolutionState !== 'open')
    return {
      decision: 'review_required',
      candidate,
      reason: 'resolution_state_invalid',
    };
  if (candidate.sourceCommercialState !== 'open')
    return {
      decision: 'review_required',
      candidate,
      reason: 'canonical_order_not_open',
    };
  if (candidate.sourceAdmissionState !== 'unreleased')
    return {
      decision: 'review_required',
      candidate,
      reason: 'fulfillment_not_unreleased',
    };

  return { decision: 'ready', candidate };
};
