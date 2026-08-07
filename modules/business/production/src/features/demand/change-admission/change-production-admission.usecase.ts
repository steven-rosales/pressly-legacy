import {
  conflictFailure,
  notFoundFailure,
  isProductionFeatureFailure,
} from '../../../foundations/language/failures/production-failure.factory.ts';
import { databaseError } from '@pressly/errors/factories';
import { mapUnknownError } from '@pressly/errors/app-error';
import { result } from '@pressly/kernel';
import { productionIdempotencyConflict } from '../../../foundations/language/commands/production-command.failure.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../../../foundations/language/commands/production-idempotency.policy.ts';
import type { Clock } from '@pressly/time';
import type { ProductionRules } from '../../../foundations/language/rules/production-rules.model.ts';
import type {
  ChangeProductionAdmission,
  ChangeProductionAdmissionRepository,
} from './change-production-admission.port.ts';
import type { ChangeProductionAdmissionResult } from './change-production-admission.model.ts';

type ChangeProductionAdmissionPolicy = Pick<
  ProductionRules,
  | 'evaluateProductionOrderOperationalAccess'
  | 'evaluateProductionAdmission'
  | 'resolveProductionOrderExecutionState'
  | 'deriveProductionOrderOperationalStatus'
>;

export const makeChangeProductionAdmission =
  (deps: {
    repo: ChangeProductionAdmissionRepository;
    policy: ChangeProductionAdmissionPolicy;
    clock: Clock;
  }): ChangeProductionAdmission =>
  async (command) => {
    try {
      return await deps.repo.transaction(async (repo) => {
        const idempotency = defineWorkEventCommand({
          operation: 'production_admission_changed',
          locationId: command.locationId,
          actorId: command.actorId,
          entityType: 'production_order',
          entityId: command.orderId,
          expectedVersion: command.expectedVersion,
          payload: { target: command.target },
        });

        const replay = resolveWorkEventReplay<ChangeProductionAdmissionResult>(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (replay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replay.tag === 'replay') return result.ok(replay.result);

        await repo.lockLocationScheduling(command.locationId);

        const order = await repo.lockOrder(command.locationId, command.orderId);
        if (order === null)
          return result.err(
            notFoundFailure({
              code: 'production_order_not_found',
              message: 'The production order was not found.',
              safeMessage: 'The production order was not found.',
            }),
          );

        if (order.productionVersion !== command.expectedVersion)
          return result.err(
            conflictFailure({
              code: 'production_order_version_conflict',
              message:
                'The order changed before its production admission was updated. Refresh and review the current state.',
              safeMessage:
                'The order changed before its production admission was updated. Refresh and review the current state.',
            }),
          );

        const access = deps.policy.evaluateProductionOrderOperationalAccess({
          resolutionState: order.resolutionState,
        });
        if (access.tag === 'err')
          return result.err(
            conflictFailure({
              code: access.error.code.toLowerCase(),
              message: access.error.message,
              safeMessage: access.error.message,
            }),
          );

        const decision = deps.policy.evaluateProductionAdmission({
          target: command.target,
          sourceAdmissionState: order.sourceAdmissionState,
          productionStatus: order.productionStatus,
          admissionOverride: order.admissionOverride,
          bagCount: order.bagCount,
          selectedForShift: order.selectedForShift,
          hasActivePlacement: order.hasActivePlacement,
        });
        if (decision.tag === 'err')
          return result.err(
            conflictFailure({
              code: decision.error.code.toLowerCase(),
              message: decision.error.message,
              safeMessage: decision.error.message,
            }),
          );

        const execution = deps.policy.resolveProductionOrderExecutionState({
          executionState: order.executionStatus,
          operationalStatus: order.productionStatus,
        });
        if (execution.tag === 'err')
          return result.err(
            conflictFailure({
              code: execution.error.code.toLowerCase(),
              message: execution.error.message,
              safeMessage: execution.error.message,
            }),
          );
        if (execution.value !== 'unassigned')
          return result.err(
            conflictFailure({
              code: 'production_admission_already_committed',
              message: 'This order is already committed to production.',
              safeMessage: 'This order is already committed to production.',
            }),
          );

        const nextStatus = deps.policy.deriveProductionOrderOperationalStatus({
          executionState: execution.value,
          admission: order.sourceAdmissionState,
          admissionOverride: decision.value.admissionOverride,
          hasPositiveDemand: order.derivedWeightLbs > 0,
          bagCount: order.bagCount,
        });
        if (
          nextStatus !== 'release_pending' &&
          nextStatus !== 'intake_pending' &&
          nextStatus !== 'eligible'
        )
          return result.err(
            conflictFailure({
              code: 'production_admission_state_invalid',
              message:
                'The production admission facts do not produce a usable readiness state.',
              safeMessage:
                'The production admission facts do not produce a usable readiness state.',
            }),
          );

        const changed = await repo.changeAdmission({
          locationId: command.locationId,
          orderId: command.orderId,
          actorId: command.actorId,
          expectedVersion: command.expectedVersion,
          admissionOverride: decision.value.admissionOverride,
          nextStatus,
          now: deps.clock.now(),
        });
        if (changed === null)
          return result.err(
            conflictFailure({
              code: 'production_order_version_conflict',
              message:
                'The order changed before its production admission was updated. Refresh and try again.',
              safeMessage:
                'The order changed before its production admission was updated. Refresh and try again.',
            }),
          );

        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'production_admission_changed',
          entityType: 'production_order',
          entityId: command.orderId,
          actorId: command.actorId,
          expectedVersion: command.expectedVersion,
          idempotencyKey: command.idempotencyKey,
          payload: {
            target: command.target,
            sourceAdmissionState: order.sourceAdmissionState,
            admissionOverride: changed.admissionOverride,
            status: changed.status,
            version: changed.version,
          },
          idempotency: { command: idempotency, result: changed },
        });

        return result.ok(changed);
      });
    } catch (error) {
      if (isProductionFeatureFailure(error)) return result.err(error);
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'production_admission_change_failed',
          message: 'The production admission could not be changed.',
          safeMessage: 'The production admission could not be changed.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };
