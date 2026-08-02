import {
  conflictError,
  databaseError,
  mapUnknownError,
  notFoundError,
} from '@pressly/errors';
import type { ChangeProductionOrderResolutionResult } from '@pressly/contracts';
import { result } from '@pressly/kernel';
import { productionIdempotencyConflict } from '../command-execution/production-command.error.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../command-execution/production-idempotency.policy.ts';
import type { ClockPort } from '../command-execution/production-command.port.ts';
import type { ProductionPolicyPort } from '../production-policy/production-policy.port.ts';
import type {
  ChangeProductionOrderResolution,
  ChangeProductionOrderResolutionRepository,
  RestoredProductionOrderSourceProjection,
} from './change-production-order-resolution.port.ts';
export type { ChangeProductionOrderResolution } from './change-production-order-resolution.port.ts';

type ChangeProductionOrderResolutionPolicy = Pick<
  ProductionPolicyPort,
  | 'evaluateProductionOrderResolutionTransition'
  | 'resolveProductionOrderExecutionState'
  | 'evaluateProductionOrderResolutionGuard'
  | 'deriveProductionOrderOperationalStatus'
>;

const restoredAdmissionFact = (input: {
  commercialState: 'open' | 'completed' | 'canceled';
  phase:
    | 'expected'
    | 'inbound'
    | 'production_released'
    | 'post_production'
    | 'withdrawn';
  admission: 'unreleased' | 'released' | 'withdrawn';
}): 'unreleased' | 'released' | 'withdrawn' | 'post_production' =>
  input.commercialState !== 'open' || input.phase === 'post_production'
    ? 'post_production'
    : input.admission;

export const makeChangeProductionOrderResolution =
  (deps: {
    repo: ChangeProductionOrderResolutionRepository;
    policy: ChangeProductionOrderResolutionPolicy;
    clock: ClockPort;
  }): ChangeProductionOrderResolution =>
  async (command) => {
    try {
      return await deps.repo.transaction(async (repo) => {
        const operation =
          command.action === 'resolve_without_production'
            ? 'production_order_resolved_without_production'
            : 'production_order_restored';
        const idempotency = defineWorkEventCommand({
          operation,
          locationId: command.locationId,
          actorId: command.actorId,
          entityType: 'production_order',
          entityId: command.orderId,
          expectedVersion: command.expectedVersion,
          payload: {
            action: command.action,
            reason: command.reason,
            note: command.note,
            ...(command.action === 'resolve_without_production'
              ? {
                  confirmReviewedFacts: command.confirmReviewedFacts,
                  ...(command.sourceStatePrecondition === undefined
                    ? {}
                    : {
                        sourceStatePrecondition:
                          command.sourceStatePrecondition,
                      }),
                }
              : {}),
          },
        });
        const replay =
          resolveWorkEventReplay<ChangeProductionOrderResolutionResult>(
            await repo.findWorkEvent(command.idempotencyKey),
            idempotency,
          );
        if (replay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replay.tag === 'replay') return result.ok(replay.result);

        await repo.lockLocationScheduling(command.locationId);
        const replayAfterLock =
          resolveWorkEventReplay<ChangeProductionOrderResolutionResult>(
            await repo.findWorkEvent(command.idempotencyKey),
            idempotency,
          );
        if (replayAfterLock.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replayAfterLock.tag === 'replay')
          return result.ok(replayAfterLock.result);

        const order = await repo.lockOrder(command.locationId, command.orderId);
        if (order === null)
          return result.err(
            notFoundError({
              code: 'production_order_not_found',
              message: 'The production order was not found.',
              safeMessage: 'The production order was not found.',
            }),
          );
        if (order.productionVersion !== command.expectedVersion)
          return result.err(
            conflictError({
              code: 'production_order_version_conflict',
              message:
                'The order changed before its archive status was updated. Refresh and review the current state.',
              safeMessage:
                'The order changed before its archive status was updated. Refresh and review the current state.',
            }),
          );
        if (
          command.sourceStatePrecondition !== undefined &&
          (order.sourceCommercialState !==
            command.sourceStatePrecondition.commercialState ||
            order.sourceAdmissionState !==
              command.sourceStatePrecondition.admissionState)
        )
          return result.err(
            conflictError({
              code: 'production_order_source_state_conflict',
              message:
                'The canonical order or fulfillment changed before the archive status was updated.',
              safeMessage:
                'The canonical order or fulfillment changed before the archive status was updated.',
            }),
          );

        const transition =
          deps.policy.evaluateProductionOrderResolutionTransition({
            state: order.resolutionState,
            event: command.action,
          });
        if (transition.tag === 'err')
          return result.err(
            conflictError({
              code: transition.error.code.toLowerCase(),
              message: transition.error.message,
              safeMessage: transition.error.message,
            }),
          );

        const execution = deps.policy.resolveProductionOrderExecutionState({
          executionState: order.executionStatus,
          operationalStatus: order.operationalStatus,
        });
        if (execution.tag === 'err')
          return result.err(
            conflictError({
              code: execution.error.code.toLowerCase(),
              message: execution.error.message,
              safeMessage: execution.error.message,
            }),
          );

        let clearPendingPlacement = false;
        let reviewReasons: readonly string[] = [];
        let restoredSourceProjection: RestoredProductionOrderSourceProjection | null =
          null;

        if (command.action === 'resolve_without_production') {
          const guard = deps.policy.evaluateProductionOrderResolutionGuard({
            executionState: execution.value,
            hasShiftSelection:
              order.hasShiftSelection || order.hasHistoricalPlanSelection,
            hasBatchMembership: order.hasBatchMembership,
            hasStageAttempt: order.hasStageAttempt,
            hasRoute: order.hasRoute,
            hasIntake: order.hasIntake,
            hasManualAdmission: order.hasManualAdmission,
            isPriority: order.isPriority,
            hasPendingPlacement: order.hasPendingPlacement,
          });
          if (guard.status === 'blocked')
            return result.err(
              conflictError({
                code: 'production_order_resolution_blocked',
                message:
                  'This order has production participation and must remain in operational history.',
                safeMessage:
                  'This order has production participation and must remain in operational history.',
              }),
            );
          if (guard.requiresExplicitReview && !command.confirmReviewedFacts)
            return result.err(
              conflictError({
                code: 'production_order_resolution_review_required',
                message:
                  'Review the recorded operational facts before archiving this order from active work.',
                safeMessage:
                  'Review the recorded operational facts before archiving this order from active work.',
              }),
            );
          clearPendingPlacement = guard.mayClearPendingPlacement;
          reviewReasons = guard.reviewReasons;
        } else {
          if (execution.value !== 'unassigned')
            return result.err(
              conflictError({
                code: 'production_order_restore_blocked',
                message:
                  'Only never-produced work can be restored to active operations.',
                safeMessage:
                  'Only never-produced work can be restored to active operations.',
              }),
            );
          if (
            order.sourceEstimatedWeightLbs === null ||
            order.sourceEstimatedWeightLbs <= 0 ||
            order.sourceEstimatedWeightSource === null
          )
            return result.err(
              conflictError({
                code: 'production_order_restore_demand_invalid',
                message:
                  'The current source demand does not contain a positive weight estimate. Refresh the source order before restoring it.',
                safeMessage:
                  'The current source demand does not contain a positive weight estimate. Refresh the source order before restoring it.',
              }),
            );
          const derivedStatus =
            deps.policy.deriveProductionOrderOperationalStatus({
              executionState: execution.value,
              admission: restoredAdmissionFact({
                commercialState: order.sourceCommercialState,
                phase: order.demandPhase,
                admission: order.sourceAdmissionState,
              }),
              admissionOverride: order.admissionOverride,
              hasPositiveDemand: true,
              bagCount: order.bagCount,
            });
          if (derivedStatus === 'scheduled' || derivedStatus === 'finished')
            return result.err(
              conflictError({
                code: 'production_order_restore_state_invalid',
                message:
                  'The retained order facts do not produce an open operational state.',
                safeMessage:
                  'The retained order facts do not produce an open operational state.',
              }),
            );
          restoredSourceProjection = {
            dueAt: order.sourceDueAt,
            derivedWeightLbs: order.sourceEstimatedWeightLbs,
            derivedWeightSource: order.sourceEstimatedWeightSource,
            operationalStatus: derivedStatus,
            clearAdmissionOverride: order.sourceAdmissionState !== 'unreleased',
          };
        }

        const now = deps.clock.now();
        const changed = await repo.changeResolution({
          locationId: command.locationId,
          orderId: command.orderId,
          actorId: command.actorId,
          expectedVersion: command.expectedVersion,
          lifecycle: transition.value,
          reason: command.reason,
          note: command.note,
          clearPendingPlacement,
          restoredSourceProjection,
          now,
        });
        if (changed === null)
          return result.err(
            conflictError({
              code: 'production_order_version_conflict',
              message:
                'The order changed before its archive status was updated. Refresh and try again.',
              safeMessage:
                'The order changed before its archive status was updated. Refresh and try again.',
            }),
          );

        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: operation,
          entityType: 'production_order',
          entityId: command.orderId,
          actorId: command.actorId,
          expectedVersion: command.expectedVersion,
          idempotencyKey: command.idempotencyKey,
          payload: {
            action: command.action,
            from: transition.value.from,
            resolutionState: changed.resolutionState,
            reason: command.reason,
            note: command.note,
            reviewReasons,
            clearedPendingPlacement: clearPendingPlacement,
            ...(restoredSourceProjection === null
              ? {}
              : {
                  restoredSourceProjection: {
                    dueAt: restoredSourceProjection.dueAt.toISOString(),
                    derivedWeightLbs: restoredSourceProjection.derivedWeightLbs,
                    operationalStatus:
                      restoredSourceProjection.operationalStatus,
                  },
                }),
            version: changed.version,
          },
          idempotency: { command: idempotency, result: changed },
        });

        return result.ok(changed);
      });
    } catch (error) {
      return result.err(
        mapUnknownError(error, (unknownCause) =>
          databaseError({
            code: 'production_order_resolution_change_failed',
            message: 'The order archive status could not be changed.',
            safeMessage: 'The order archive status could not be changed.',
            status: 503,
            cause: unknownCause,
          }),
        ),
      );
    }
  };
