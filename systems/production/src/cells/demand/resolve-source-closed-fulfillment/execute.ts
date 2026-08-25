import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import {
  decideSourceClosedFulfillment,
  reviewReasonForResolutionFailure,
} from './decide.ts';
import type {
  ProductionOrderResolutionCandidate,
  ResolveProductionOrderWithoutProduction,
  ResolveSourceClosedFulfillmentCommand,
  ResolveSourceClosedFulfillmentExpectedFailure,
  ResolveSourceClosedFulfillmentRepository,
  ResolveSourceClosedFulfillmentResult,
  SourceClosedFulfillmentReviewReason,
} from './types.ts';

export type ResolveSourceClosedFulfillmentDependencies = Readonly<{
  repo: ResolveSourceClosedFulfillmentRepository;
  resolveProductionOrder: ResolveProductionOrderWithoutProduction;
}>;

export type ExecuteResolveSourceClosedFulfillment = (
  command: ResolveSourceClosedFulfillmentCommand,
) => Promise<
  CellOutcome<
    ResolveSourceClosedFulfillmentResult,
    ResolveSourceClosedFulfillmentExpectedFailure
  >
>;

const success = (
  value: ResolveSourceClosedFulfillmentResult,
): CellOutcome<
  ResolveSourceClosedFulfillmentResult,
  ResolveSourceClosedFulfillmentExpectedFailure
> => ({ kind: 'success', value });

const reviewRequired = (
  command: ResolveSourceClosedFulfillmentCommand,
  candidate: ProductionOrderResolutionCandidate,
  reason: SourceClosedFulfillmentReviewReason,
): ResolveSourceClosedFulfillmentResult => ({
  outcome: 'review_required',
  locationId: command.locationId,
  fulfillmentId: command.fulfillmentId,
  productionOrderId: candidate.productionOrderId,
  version: candidate.productionVersion,
  reason,
});

const isSameResolvedCandidate = (
  expected: ProductionOrderResolutionCandidate,
  current: ProductionOrderResolutionCandidate | null,
): current is ProductionOrderResolutionCandidate =>
  current !== null &&
  current.productionOrderId === expected.productionOrderId &&
  current.productionVersion === expected.productionVersion &&
  current.resolutionState === 'resolved_without_production';

export const makeExecuteResolveSourceClosedFulfillment =
  (
    deps: ResolveSourceClosedFulfillmentDependencies,
  ): ExecuteResolveSourceClosedFulfillment =>
  async (command) => {
    try {
      const decision = decideSourceClosedFulfillment(
        await deps.repo.findCandidate(
          command.locationId,
          command.fulfillmentId,
        ),
      );
      if (decision.kind === 'not_found')
        return success({
          outcome: 'not_found',
          locationId: command.locationId,
          fulfillmentId: command.fulfillmentId,
        });
      if (decision.kind === 'already_resolved') {
        const replay = await deps.resolveProductionOrder({
          locationId: command.locationId,
          productionOrderId: decision.candidate.productionOrderId,
          action: 'resolve_without_production',
          reason: 'order_will_not_be_produced',
          note: null,
          confirmReviewedFacts: false,
          sourceStatePrecondition: {
            commercialState: 'open',
            admissionState: 'unreleased',
          },
          expectedVersion: decision.candidate.productionVersion - 1,
          idempotencyKey: command.idempotencyKey,
          actorId: command.actorId,
        });
        if (replay.kind === 'success')
          return success({
            outcome: 'resolved',
            locationId: command.locationId,
            fulfillmentId: command.fulfillmentId,
            productionOrderId: replay.value.orderId,
            version: replay.value.version,
            replayed: replay.value.replayed,
          });
        if (replay.failure.code === 'production_idempotency_conflict')
          return success(
            reviewRequired(command, decision.candidate, 'concurrent_change'),
          );
        const current = await deps.repo.findCandidate(
          command.locationId,
          command.fulfillmentId,
        );
        if (!isSameResolvedCandidate(decision.candidate, current))
          return success(
            reviewRequired(
              command,
              current ?? decision.candidate,
              'concurrent_change',
            ),
          );
        return success({
          outcome: 'already_resolved',
          locationId: command.locationId,
          fulfillmentId: command.fulfillmentId,
          productionOrderId: current.productionOrderId,
          version: current.productionVersion,
        });
      }
      if (decision.kind === 'review_required')
        return success(
          reviewRequired(command, decision.candidate, decision.reason),
        );

      const resolution = await deps.resolveProductionOrder({
        locationId: command.locationId,
        productionOrderId: decision.candidate.productionOrderId,
        action: 'resolve_without_production',
        reason: 'order_will_not_be_produced',
        note: null,
        confirmReviewedFacts: false,
        sourceStatePrecondition: {
          commercialState: 'open',
          admissionState: 'unreleased',
        },
        expectedVersion: decision.candidate.productionVersion,
        idempotencyKey: command.idempotencyKey,
        actorId: command.actorId,
      });
      if (resolution.kind === 'failure')
        return success(
          reviewRequired(
            command,
            decision.candidate,
            reviewReasonForResolutionFailure(resolution.failure.code),
          ),
        );
      return success({
        outcome: 'resolved',
        locationId: command.locationId,
        fulfillmentId: command.fulfillmentId,
        productionOrderId: resolution.value.orderId,
        version: resolution.value.version,
        replayed: resolution.value.replayed,
      });
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_source_closed_resolution_failed',
          message: 'The source-closed fulfillment could not be evaluated.',
          safeMessage: 'The source-closed fulfillment could not be evaluated.',
          status: 503,
          cause,
        }),
      );
    }
  };
