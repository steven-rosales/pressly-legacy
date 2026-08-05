import { isProductionFeatureFailure } from '../../../foundations/language/failures/production-failure.factory.ts';
import { databaseError } from '@pressly/errors/factories';
import { mapUnknownError } from '@pressly/errors/app-error';
import { result } from '@pressly/kernel';

import type {
  ProductionOrderResolutionCandidate,
  ResolveSourceClosedFulfillmentCommand,
  ResolveSourceClosedFulfillmentResult,
  SourceClosedFulfillmentReviewReason,
} from './resolve-source-closed-fulfillment.model.ts';
import type {
  ResolveProductionOrderWithoutProduction,
  ResolveSourceClosedFulfillment,
  ResolveSourceClosedFulfillmentRepository,
} from './resolve-source-closed-fulfillment.port.ts';
import { classifySourceClosedFulfillment } from './resolve-source-closed-fulfillment.policy.ts';

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
    repo: ResolveSourceClosedFulfillmentRepository;
    resolveProductionOrder: ResolveProductionOrderWithoutProduction;
  }): ResolveSourceClosedFulfillment =>
  async (command) => {
    try {
      const candidate = await deps.repo.findCandidate(
        command.locationId,
        command.fulfillmentId,
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

      const changed = await deps.resolveProductionOrder({
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

      return result.ok(
        reviewRequired(
          command,
          preflight.candidate,
          reviewReasonForResolutionError(changed.error.code),
        ),
      );
    } catch (error) {
      if (isProductionFeatureFailure(error)) return result.err(error);
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'production_source_closed_resolution_failed',
          message: 'The source-closed fulfillment could not be evaluated.',
          safeMessage: 'The source-closed fulfillment could not be evaluated.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };
