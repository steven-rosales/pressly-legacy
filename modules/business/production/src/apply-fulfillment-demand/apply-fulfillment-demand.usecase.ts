import { result } from '@pressly/kernel';
import {
  productionError,
  productionIdempotencyConflict,
} from '../production.error.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../production-idempotency.policy.ts';
import type {
  ClockPort,
  IdPort,
  OrderDemandPhase,
  ProductionPolicyPort,
} from '../production.port.ts';
import type {
  ApplyFulfillmentDemand,
  ApplyFulfillmentDemandRepository,
  ApplyFulfillmentDemandResult,
  FulfillmentAdmissionState,
} from './apply-fulfillment-demand.port.ts';

const systemActorId = '00000000-0000-4000-8000-000000000000';
const hashPattern = /^[a-f0-9]{64}$/;

const demandPhase = (
  admission: FulfillmentAdmissionState,
): OrderDemandPhase => {
  switch (admission) {
    case 'unreleased':
      return 'expected';
    case 'released':
      return 'production_released';
    case 'withdrawn':
      return 'withdrawn';
  }
};

export const makeApplyFulfillmentDemand =
  (deps: {
    repo: ApplyFulfillmentDemandRepository;
    policy: ProductionPolicyPort;
    clock: ClockPort;
    ids: IdPort;
  }): ApplyFulfillmentDemand =>
  async (command) => {
    try {
      return await deps.repo.transaction(async (repo) => {
        const idempotency = defineWorkEventCommand({
          operation: 'fulfillment_demand_applied',
          locationId: command.locationId,
          actorId: systemActorId,
          entityType: 'order_demand',
          payload: {
            fulfillmentId: command.fulfillmentId,
            fulfillmentVersion: command.fulfillmentVersion,
            projectionHash: command.projectionHash,
            displayReference: command.displayReference,
            admissionState: command.admissionState,
            commercialState: command.commercialState,
            dueAt: command.dueAt,
            observedAt: command.observedAt,
            estimatedWeightLbs: command.estimatedWeightLbs,
            estimatedWeightSource: command.estimatedWeightSource,
            bagCount: command.bagCount,
          },
        });
        const replay = resolveWorkEventReplay<ApplyFulfillmentDemandResult>(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (replay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replay.tag === 'replay') return result.ok(replay.result);

        const dueAt = Date.parse(command.dueAt);
        const observedAt = Date.parse(command.observedAt);
        if (
          !Number.isInteger(command.fulfillmentVersion) ||
          command.fulfillmentVersion < 1 ||
          !hashPattern.test(command.projectionHash) ||
          !Number.isFinite(dueAt) ||
          !Number.isFinite(observedAt) ||
          (command.bagCount !== null &&
            (!Number.isInteger(command.bagCount) || command.bagCount < 0))
        )
          return result.err(
            productionError(
              'FULFILLMENT_DEMAND_INVALID',
              'The fulfillment demand version, dates, hash, or bag count are invalid.',
              422,
            ),
          );

        if (
          (command.estimatedWeightLbs !== null &&
            (!Number.isFinite(command.estimatedWeightLbs) ||
              command.estimatedWeightLbs <= 0)) ||
          (command.estimatedWeightLbs === null) !==
            (command.estimatedWeightSource === null)
        )
          return result.err(
            productionError(
              'FULFILLMENT_DEMAND_WEIGHT_INVALID',
              'The fulfillment estimate and its provenance are inconsistent.',
              422,
            ),
          );

        if (!(await repo.locationIsActive(command.locationId)))
          return result.err(
            productionError(
              'PRODUCTION_LOCATION_UNAVAILABLE',
              'The production location is missing or inactive.',
              422,
            ),
          );

        await repo.lockLocationScheduling(command.locationId);
        await repo.lockFulfillment(command.fulfillmentId);
        const existing = await repo.loadDemand(command.fulfillmentId);
        const orderDemandId = existing?.orderDemandId ?? deps.ids.next();

        if (existing !== null && existing.locationId !== command.locationId)
          return result.err(
            productionError(
              'FULFILLMENT_LOCATION_CHANGED',
              'The fulfillment resolved to a different production location.',
            ),
          );

        const appendOutcome = async (
          value: ApplyFulfillmentDemandResult,
        ): Promise<void> =>
          repo.appendWorkEvent({
            locationId: command.locationId,
            eventType: 'fulfillment_demand_applied',
            entityType: 'order_demand',
            entityId: orderDemandId,
            actorId: systemActorId,
            idempotencyKey: command.idempotencyKey,
            payload: { outcome: value.outcome },
            idempotency: { command: idempotency, result: value },
          });

        if (
          existing !== null &&
          command.fulfillmentVersion < existing.fulfillmentVersion
        ) {
          const value: ApplyFulfillmentDemandResult = {
            orderDemandId,
            productionOrderId: existing.productionOrderId,
            outcome: 'ignored_older',
            replayed: false,
          };
          await appendOutcome(value);
          return result.ok(value);
        }

        if (
          existing !== null &&
          command.fulfillmentVersion === existing.fulfillmentVersion &&
          command.projectionHash !== existing.projectionHash
        )
          return result.err(
            productionError(
              'FULFILLMENT_DEMAND_DIVERGED',
              'The same fulfillment version produced different demand data.',
            ),
          );

        if (
          existing !== null &&
          command.fulfillmentVersion === existing.fulfillmentVersion
        ) {
          const value: ApplyFulfillmentDemandResult = {
            orderDemandId,
            productionOrderId: existing.productionOrderId,
            outcome: 'unchanged',
            replayed: false,
          };
          await appendOutcome(value);
          return result.ok(value);
        }

        const lifecycle = deps.policy.evaluateDemandLifecycle({
          phase: demandPhase(command.admissionState),
          productionStatus: existing?.productionStatus ?? null,
          currentBagCount: existing?.bagCount ?? null,
          incomingBagCount: command.bagCount,
          estimatedWeightLbs: command.estimatedWeightLbs,
        });
        const applied = await repo.applyDemand({
          command,
          orderDemandId,
          production: lifecycle.production,
          effectiveBagCount: lifecycle.effectiveBagCount,
          now: deps.clock.now(),
        });
        const value: ApplyFulfillmentDemandResult = {
          orderDemandId,
          productionOrderId: applied.productionOrderId,
          outcome: 'applied',
          replayed: false,
        };
        await appendOutcome(value);
        return result.ok(value);
      });
    } catch (error) {
      return result.err(
        productionError(
          'FULFILLMENT_DEMAND_APPLICATION_FAILED',
          'The fulfillment demand could not be applied.',
          500,
          error,
        ),
      );
    }
  };
