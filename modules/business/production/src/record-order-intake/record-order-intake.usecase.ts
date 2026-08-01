import { result } from '@pressly/kernel';
import type { RecordOrderIntakeResult } from '@pressly/contracts';
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
  RecordOrderIntake,
  RecordOrderIntakeRepository,
} from './record-order-intake.port.ts';
export type { RecordOrderIntake } from './record-order-intake.port.ts';

export const makeRecordOrderIntake =
  (deps: {
    repo: RecordOrderIntakeRepository;
    policy: ProductionPolicyPort;
    clock: ClockPort;
  }): RecordOrderIntake =>
  async (command) => {
    try {
      const outcome = await deps.repo.transaction(async (repo) => {
        const idempotency = defineWorkEventCommand({
          operation: 'production_order_intake_recorded',
          locationId: command.locationId,
          actorId: command.actorId,
          entityType: 'production_order',
          entityId: command.orderId,
          expectedVersion: command.expectedVersion,
          payload: { bagCount: command.bagCount },
        });
        const replay = resolveWorkEventReplay<RecordOrderIntakeResult>(
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
              'The production order changed before intake was recorded.',
            ),
          );

        const access = deps.policy.evaluateProductionOrderOperationalAccess({
          resolutionState: order.resolutionState,
        });
        if (access.tag === 'err')
          return result.err(
            productionError(access.error.code, access.error.message, 409),
          );

        if (
          !['release_pending', 'intake_pending', 'eligible'].includes(
            order.productionStatus,
          )
        )
          return result.err(
            productionError(
              'PRODUCTION_ORDER_INTAKE_STATE_INVALID',
              'Bag intake cannot change after an order enters production.',
            ),
          );

        const admission = deps.policy.evaluateIntakeAdmission({
          phase: order.demandPhase,
          derivedWeightLbs: order.derivedWeightLbs,
          bagCount: command.bagCount,
        });
        if (admission.tag === 'err')
          return result.err(
            productionError(admission.error.code, admission.error.message, 409),
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
              'PRODUCTION_ORDER_INTAKE_STATE_INVALID',
              'Bag intake cannot change after an order enters production.',
              409,
            ),
          );
        const nextStatus = deps.policy.deriveProductionOrderOperationalStatus({
          executionState: execution.value,
          admission:
            order.demandPhase === 'production_released'
              ? 'released'
              : order.demandPhase === 'withdrawn'
                ? 'withdrawn'
                : order.demandPhase === 'post_production'
                  ? 'post_production'
                  : 'unreleased',
          admissionOverride: order.admissionOverride,
          hasPositiveDemand: order.derivedWeightLbs > 0,
          bagCount: command.bagCount,
        });
        if (nextStatus !== 'release_pending' && nextStatus !== 'eligible')
          return result.err(
            productionError(
              'PRODUCTION_ORDER_INTAKE_STATE_INVALID',
              'Bag intake does not produce an admissible production state.',
              409,
            ),
          );

        const recorded = await repo.recordIntake({
          locationId: command.locationId,
          orderId: command.orderId,
          bagCount: command.bagCount,
          expectedVersion: command.expectedVersion,
          currentIntakeVersion: order.intakeVersion,
          nextStatus,
          now: deps.clock.now(),
        });
        if (recorded === null)
          return result.err(
            productionError(
              'PRODUCTION_ORDER_VERSION_CONFLICT',
              'The production order changed before intake was recorded.',
            ),
          );

        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'production_order_intake_recorded',
          entityType: 'production_order',
          entityId: command.orderId,
          actorId: command.actorId,
          expectedVersion: command.expectedVersion,
          idempotencyKey: command.idempotencyKey,
          payload: {
            bagCount: recorded.bagCount,
            bagCountProvenance: recorded.bagCountProvenance,
            intakeVersion: recorded.intakeVersion,
            version: recorded.version,
          },
          idempotency: { command: idempotency, result: recorded },
        });

        return result.ok(recorded);
      });
      return outcome;
    } catch (error) {
      return result.err(
        productionError(
          'PRODUCTION_INTAKE_FAILED',
          'Bag intake could not be recorded.',
          500,
          error,
        ),
      );
    }
  };
