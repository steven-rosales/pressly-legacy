import {
  conflictError,
  databaseError,
  mapUnknownError,
  notFoundError,
} from '@pressly/errors';
import type { ChangeProductionAdmissionResult } from '@pressly/contracts';
import { result } from '@pressly/kernel';
import { productionIdempotencyConflict } from '../command-execution/production-command.error.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../command-execution/production-idempotency.policy.ts';
import type { ClockPort } from '../command-execution/production-command.port.ts';
import type { ProductionPolicyPort } from '../production-policy/production-policy.port.ts';
import type {
  ChangeProductionAdmission,
  ChangeProductionAdmissionRepository,
} from './change-production-admission.port.ts';
export type { ChangeProductionAdmission } from './change-production-admission.port.ts';

type ChangeProductionAdmissionPolicy = Pick<
  ProductionPolicyPort,
  | 'evaluateProductionOrderOperationalAccess'
  | 'evaluateProductionAdmission'
  | 'resolveProductionOrderExecutionState'
  | 'deriveProductionOrderOperationalStatus'
>;

export const makeChangeProductionAdmission =
  (deps: {
    repo: ChangeProductionAdmissionRepository;
    policy: ChangeProductionAdmissionPolicy;
    clock: ClockPort;
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
            conflictError({
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
            conflictError({
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
            conflictError({
              code: execution.error.code.toLowerCase(),
              message: execution.error.message,
              safeMessage: execution.error.message,
            }),
          );
        if (execution.value !== 'unassigned')
          return result.err(
            conflictError({
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
            conflictError({
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
            conflictError({
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
      return result.err(
        mapUnknownError(error, (unknownCause) =>
          databaseError({
            code: 'production_admission_change_failed',
            message: 'The production admission could not be changed.',
            safeMessage: 'The production admission could not be changed.',
            status: 503,
            cause: unknownCause,
          }),
        ),
      );
    }
  };
