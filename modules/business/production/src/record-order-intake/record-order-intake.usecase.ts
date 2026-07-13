import { result } from '@pressly/kernel';
import type { RecordOrderIntakeResult } from '@pressly/contracts';
import {
  productionError,
  productionIdempotencyConflict,
} from '../production.error.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../production-idempotency.policy.ts';
import type { ClockPort, ProductionPolicyPort } from '../production.port.ts';
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
      return await deps.repo.transaction(async (repo) => {
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

        if (!['intake_pending', 'eligible'].includes(order.productionStatus))
          return result.err(
            productionError(
              'PRODUCTION_ORDER_INTAKE_STATE_INVALID',
              'Bag intake cannot change after an order enters production.',
            ),
          );

        const eligibility = deps.policy.evaluateEligibility({
          state: order.demandState,
          derivedWeightLbs: order.derivedWeightLbs,
          bagCount: command.bagCount,
        });
        if (eligibility.tag === 'err')
          return result.err(
            productionError(
              eligibility.error.code,
              eligibility.error.message,
              409,
            ),
          );

        const recorded = await repo.recordIntake({
          locationId: command.locationId,
          orderId: command.orderId,
          bagCount: command.bagCount,
          expectedVersion: command.expectedVersion,
          currentIntakeVersion: order.intakeVersion,
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
