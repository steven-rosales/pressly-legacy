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
import type { ProductionRules } from '../../../foundations/language/rules/production-rules.factory.ts';
import type {
  RecordOrderIntake,
  RecordOrderIntakeRepository,
} from './record-order-intake.port.ts';
import type { RecordOrderIntakeResult } from './record-order-intake.model.ts';
export type { RecordOrderIntake } from './record-order-intake.port.ts';

type RecordOrderIntakePolicy = Pick<
  ProductionRules,
  | 'evaluateProductionOrderOperationalAccess'
  | 'evaluateIntakeAdmission'
  | 'resolveProductionOrderExecutionState'
  | 'deriveProductionOrderOperationalStatus'
>;

export const makeRecordOrderIntake =
  (deps: {
    repo: RecordOrderIntakeRepository;
    policy: RecordOrderIntakePolicy;
    clock: Clock;
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
                'The production order changed before intake was recorded.',
              safeMessage:
                'The production order changed before intake was recorded.',
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

        if (
          !['release_pending', 'intake_pending', 'eligible'].includes(
            order.productionStatus,
          )
        )
          return result.err(
            conflictFailure({
              code: 'production_order_intake_state_invalid',
              message:
                'Bag intake cannot change after an order enters production.',
              safeMessage:
                'Bag intake cannot change after an order enters production.',
            }),
          );

        const admission = deps.policy.evaluateIntakeAdmission({
          phase: order.demandPhase,
          derivedWeightLbs: order.derivedWeightLbs,
          bagCount: command.bagCount,
        });
        if (admission.tag === 'err')
          return result.err(
            conflictFailure({
              code: admission.error.code.toLowerCase(),
              message: admission.error.message,
              safeMessage: admission.error.message,
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
              code: 'production_order_intake_state_invalid',
              message:
                'Bag intake cannot change after an order enters production.',
              safeMessage:
                'Bag intake cannot change after an order enters production.',
            }),
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
            conflictFailure({
              code: 'production_order_intake_state_invalid',
              message:
                'Bag intake does not produce an admissible production state.',
              safeMessage:
                'Bag intake does not produce an admissible production state.',
            }),
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
            conflictFailure({
              code: 'production_order_version_conflict',
              message:
                'The production order changed before intake was recorded.',
              safeMessage:
                'The production order changed before intake was recorded.',
            }),
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
      if (isProductionFeatureFailure(error)) return result.err(error);
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'production_intake_failed',
          message: 'Bag intake could not be recorded.',
          safeMessage: 'Bag intake could not be recorded.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };
