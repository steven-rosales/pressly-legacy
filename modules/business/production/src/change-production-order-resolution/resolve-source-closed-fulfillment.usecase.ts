import { result } from '@pressly/kernel';
import { productionError } from '../failure-mapping/production.error.ts';
import type {
  ChangeProductionOrderResolution,
  ChangeProductionOrderResolutionRepository,
  ProductionOrderResolutionCandidate,
} from './change-production-order-resolution.port.ts';
import type {
  ResolveSourceClosedFulfillment,
  ResolveSourceClosedFulfillmentCommand,
  ResolveSourceClosedFulfillmentResult,
  SourceClosedFulfillmentReviewReason,
} from './resolve-source-closed-fulfillment.port.ts';
import { classifySourceClosedFulfillment } from './resolve-source-closed-fulfillment.policy.ts';

export type {
  ResolveSourceClosedFulfillment,
  ResolveSourceClosedFulfillmentCommand,
  ResolveSourceClosedFulfillmentResult,
} from './resolve-source-closed-fulfillment.port.ts';

const reviewReasonForResolutionError = (
  code: string,
): SourceClosedFulfillmentReviewReason => {
  switch (code) {
    case 'production_order_resolution_review_required':
      return 'operational_review_required';
    case 'production_order_resolution_blocked':
      return 'operational_participation';
    default:
      return 'concurrent_change';
  }
};

const reviewRequired = (
  command: ResolveSourceClosedFulfillmentCommand,
  candidate: ProductionOrderResolutionCandidate,
  reason: SourceClosedFulfillmentReviewReason,
): ResolveSourceClosedFulfillmentResult => ({
  outcome: 'review_required',
  locationId: command.locationId,
  fulfillmentId: command.fulfillmentId,
  productionOrderId: candidate.orderId,
  version: candidate.productionVersion,
  reason,
});

/**
 * Requests a source-neutral Production resolution for an accepted fulfillment.
 * The delegated resolution use case owns the scheduling lock, graph decision,
 * operational guard, idempotency, audit event, and final compare-and-swap.
 */
export const makeResolveSourceClosedFulfillment =
  (deps: {
    repo: ChangeProductionOrderResolutionRepository;
    changeResolution: ChangeProductionOrderResolution;
  }): ResolveSourceClosedFulfillment =>
  async (command) => {
    try {
      const candidate = await deps.repo.transaction((repo) =>
        repo.findOrderByFulfillment(command.locationId, command.fulfillmentId),
      );
      const preflight = classifySourceClosedFulfillment(candidate);

      if (preflight.decision === 'not_found')
        return result.ok({
          outcome: 'not_found',
          locationId: command.locationId,
          fulfillmentId: command.fulfillmentId,
        });
      if (preflight.decision === 'already_resolved')
        return result.ok({
          outcome: 'already_resolved',
          locationId: command.locationId,
          fulfillmentId: command.fulfillmentId,
          productionOrderId: preflight.candidate.orderId,
          version: preflight.candidate.productionVersion,
        });
      if (preflight.decision === 'review_required')
        return result.ok(
          reviewRequired(command, preflight.candidate, preflight.reason),
        );

      const changed = await deps.changeResolution({
        locationId: command.locationId,
        orderId: preflight.candidate.orderId,
        action: 'resolve_without_production',
        reason: 'order_will_not_be_produced',
        note: null,
        confirmReviewedFacts: false,
        sourceStatePrecondition: {
          commercialState: 'open',
          admissionState: 'unreleased',
        },
        expectedVersion: preflight.candidate.productionVersion,
        idempotencyKey: command.idempotencyKey,
        actorId: command.actorId,
      });
      if (changed.tag === 'ok')
        return result.ok({
          outcome: 'resolved',
          locationId: command.locationId,
          fulfillmentId: command.fulfillmentId,
          productionOrderId: changed.value.orderId,
          version: changed.value.version,
          replayed: changed.value.replayed,
        });

      if (changed.error.status >= 500) return result.err(changed.error);

      return result.ok(
        reviewRequired(
          command,
          preflight.candidate,
          reviewReasonForResolutionError(changed.error.code),
        ),
      );
    } catch (error) {
      return result.err(
        productionError(
          'PRODUCTION_SOURCE_CLOSED_RESOLUTION_FAILED',
          'The source-closed fulfillment could not be evaluated.',
          500,
          error,
        ),
      );
    }
  };
