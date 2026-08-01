import type { ChangeProductionAdmissionResult } from '@pressly/contracts';
import { result } from '@pressly/kernel';
import {
  productionError,
  productionIdempotencyConflict,
} from '../failure-mapping/production.error.ts';
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

export const makeChangeProductionAdmission =
  (deps: {
    repo: ChangeProductionAdmissionRepository;
    policy: ProductionPolicyPort;
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
            productionError(
              'PRODUCTION_ORDER_NOT_FOUND',
              'The production order was not found.',
              404,
            ),
          );

        if (order.productionVersion !== command.expectedVersion)
          return result.err(
            productionError(
              'PRODUCTION_ORDER_VERSION_CONFLICT',
              'The order changed before its production admission was updated. Refresh and review the current state.',
            ),
          );

        const access = deps.policy.evaluateProductionOrderOperationalAccess({
          resolutionState: order.resolutionState,
        });
        if (access.tag === 'err')
          return result.err(
            productionError(access.error.code, access.error.message, 409),
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
            productionError(decision.error.code, decision.error.message, 409),
          );

        const execution = deps.policy.resolveProductionOrderExecutionState({
          executionState: order.executionStatus,
          operationalStatus: order.productionStatus,
        });
        if (execution.tag === 'err')
          return result.err(
            productionError(execution.error.code, execution.error.message, 409),
          );
        if (execution.value !== 'unassigned')
          return result.err(
            productionError(
              'PRODUCTION_ADMISSION_ALREADY_COMMITTED',
              'This order is already committed to production.',
              409,
            ),
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
            productionError(
              'PRODUCTION_ADMISSION_STATE_INVALID',
              'The production admission facts do not produce a usable readiness state.',
              409,
            ),
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
            productionError(
              'PRODUCTION_ORDER_VERSION_CONFLICT',
              'The order changed before its production admission was updated. Refresh and try again.',
            ),
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
        productionError(
          'PRODUCTION_ADMISSION_CHANGE_FAILED',
          'The production admission could not be changed.',
          500,
          error,
        ),
      );
    }
  };
