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
  ProductionPolicyPort,
} from '../production.port.ts';
import type {
  ApplyOrderDemand,
  ApplyOrderDemandRepository,
  ApplyOrderDemandResult,
} from './apply-order-demand.port.ts';

const systemActorId = '00000000-0000-4000-8000-000000000000';

export const makeApplyOrderDemand =
  (deps: {
    repo: ApplyOrderDemandRepository;
    policy: ProductionPolicyPort;
    clock: ClockPort;
    ids: IdPort;
  }): ApplyOrderDemand =>
  async (command) => {
    try {
      const outcome = await deps.repo.transaction(async (repo) => {
        const idempotency = defineWorkEventCommand({
          operation: 'order_demand_applied',
          locationId: command.locationId,
          actorId: systemActorId,
          entityType: 'order_demand',
          payload: {
            demandKey: command.demandKey,
            displayReference: command.displayReference,
            revisionAt: command.revisionAt,
            revisionHash: command.revisionHash,
            phase: command.phase,
            sourceStatusCode: command.sourceStatusCode,
            dueAt: command.dueAt,
            estimatedWeightLbs: command.estimatedWeightLbs,
            estimatedWeightSource: command.estimatedWeightSource,
            bagCount: command.bagCount,
          },
        });
        const replay = resolveWorkEventReplay<ApplyOrderDemandResult>(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (replay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replay.tag === 'replay') return result.ok(replay.result);

        if (!(await repo.locationIsActive(command.locationId)))
          return result.err(
            productionError(
              'PRODUCTION_LOCATION_UNAVAILABLE',
              'The production location is missing or inactive.',
              422,
            ),
          );

        await repo.lockLocationScheduling(command.locationId);
        await repo.lockDemand(command.demandKey);
        const existing = await repo.loadDemand(command.demandKey);
        const orderDemandId = existing?.orderDemandId ?? deps.ids.next();

        if (existing !== null && existing.locationId !== command.locationId)
          return result.err(
            productionError(
              'ORDER_DEMAND_LOCATION_CHANGED',
              'The order demand resolved to a different production location.',
            ),
          );

        const incomingRevisionAt = Date.parse(command.revisionAt);
        const storedRevisionAt =
          existing === null ? null : Date.parse(existing.revisionAt);
        if (!Number.isFinite(incomingRevisionAt))
          return result.err(
            productionError(
              'ORDER_DEMAND_REVISION_INVALID',
              'The order demand revision timestamp is invalid.',
              422,
            ),
          );

        const appendOutcome = async (
          value: ApplyOrderDemandResult,
        ): Promise<void> =>
          repo.appendWorkEvent({
            locationId: command.locationId,
            eventType: 'order_demand_applied',
            entityType: 'order_demand',
            entityId: orderDemandId,
            actorId: systemActorId,
            idempotencyKey: command.idempotencyKey,
            payload: { outcome: value.outcome },
            idempotency: { command: idempotency, result: value },
          });

        if (
          existing !== null &&
          storedRevisionAt !== null &&
          incomingRevisionAt < storedRevisionAt
        ) {
          const value: ApplyOrderDemandResult = {
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
          incomingRevisionAt === storedRevisionAt &&
          command.revisionHash !== existing.revisionHash
        )
          return result.err(
            productionError(
              'ORDER_DEMAND_REVISION_DIVERGED',
              'The order source supplied divergent data at an existing revision.',
            ),
          );

        if (existing !== null && incomingRevisionAt === storedRevisionAt) {
          const value: ApplyOrderDemandResult = {
            orderDemandId,
            productionOrderId: existing.productionOrderId,
            outcome: 'unchanged',
            replayed: false,
          };
          await appendOutcome(value);
          return result.ok(value);
        }

        if (
          (command.estimatedWeightLbs !== null &&
            (!Number.isFinite(command.estimatedWeightLbs) ||
              command.estimatedWeightLbs <= 0)) ||
          (command.estimatedWeightLbs === null) !==
            (command.estimatedWeightSource === null)
        )
          return result.err(
            productionError(
              'ORDER_DEMAND_WEIGHT_INVALID',
              'The order demand estimate and provenance are inconsistent.',
              422,
            ),
          );

        const lifecycle = deps.policy.evaluateDemandLifecycle({
          phase: command.phase,
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
        const value: ApplyOrderDemandResult = {
          orderDemandId,
          productionOrderId: applied.productionOrderId,
          outcome: 'applied',
          replayed: false,
        };
        await appendOutcome(value);
        return result.ok(value);
      });
      return outcome;
    } catch (error) {
      return result.err(
        productionError(
          'ORDER_DEMAND_APPLICATION_FAILED',
          'The order demand could not be applied.',
          500,
          error,
        ),
      );
    }
  };
