import { result } from '@pressly/kernel';
import {
  productionError,
  productionIdempotencyConflict,
} from '../failure-mapping/production.error.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../command-execution/production-idempotency.policy.ts';
import type {
  ClockPort,
  IdPort,
} from '../command-execution/production-command.port.ts';
import type { OrderDemandPhase } from '../production-lifecycle/order-demand.port.ts';
import type { ProductionOrderExecutionState } from '../production-lifecycle/production-lifecycle.port.ts';
import type { ProductionPolicyPort } from '../production-policy/production-policy.port.ts';
import type {
  ApplyFulfillmentDemand,
  ApplyFulfillmentDemandRepository,
  ApplyFulfillmentDemandResult,
  FulfillmentAdmissionState,
  FulfillmentProductionMutation,
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

        const effectiveAdmissionState =
          command.admissionState === 'unreleased' &&
          existing?.admissionOverride === 'released'
            ? 'released'
            : command.admissionState;
        const lifecycle = deps.policy.evaluateDemandLifecycle({
          phase: demandPhase(effectiveAdmissionState),
          productionStatus: existing?.productionStatus ?? null,
          currentBagCount: existing?.bagCount ?? null,
          estimatedWeightLbs: command.estimatedWeightLbs,
        });
        let production: FulfillmentProductionMutation =
          existing?.productionResolutionState === 'resolved_without_production'
            ? { action: 'preserve' }
            : lifecycle.production;
        if (production.action === 'create' || production.action === 'update') {
          let executionState: ProductionOrderExecutionState =
            deps.policy.initialProductionOrderExecutionState;
          if (
            existing?.productionStatus !== null &&
            existing?.productionStatus !== undefined
          ) {
            const resolved = deps.policy.resolveProductionOrderExecutionState({
              executionState: existing.productionExecutionStatus,
              operationalStatus: existing.productionStatus,
            });
            if (resolved.tag === 'err')
              return result.err(
                productionError(
                  resolved.error.code,
                  resolved.error.message,
                  409,
                ),
              );
            executionState = resolved.value;
          }
          production = {
            ...production,
            status: deps.policy.deriveProductionOrderOperationalStatus({
              executionState,
              admission: command.admissionState,
              admissionOverride: existing?.admissionOverride ?? null,
              hasPositiveDemand:
                command.estimatedWeightLbs !== null &&
                command.estimatedWeightLbs > 0,
              bagCount: lifecycle.canonicalBagCount,
            }),
          };
        }
        const applied = await repo.applyDemand({
          command,
          orderDemandId,
          production,
          initialExecutionState:
            deps.policy.initialProductionOrderExecutionState,
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
