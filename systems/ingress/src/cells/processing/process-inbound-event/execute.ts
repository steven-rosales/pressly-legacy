import type { CellOutcome } from '@pressly/cells';
import type { WebhookEventReadyV1 } from '../../../contracts/webhook-event-ready-v1.ts';
import {
  decideCentsInboundEvent,
  toProposeIncomingOrderCommand,
} from './cents.ts';
import {
  ordersInboundFailure,
  productionProjectionPendingFailure,
  storedInboundEventFailure,
} from './failures.ts';
import {
  processInboundEventSystemActorId,
  type CapabilityOutcome,
  type ProcessInboundEventDependencies,
  type ProcessInboundEventExpectedFailure,
  type ProcessInboundEventResult,
} from './types.ts';

export type ExecuteProcessInboundEvent = (
  command: WebhookEventReadyV1,
) => Promise<
  CellOutcome<ProcessInboundEventResult, ProcessInboundEventExpectedFailure>
>;

const acknowledged = (): CellOutcome<
  ProcessInboundEventResult,
  ProcessInboundEventExpectedFailure
> => ({ kind: 'success', value: { acknowledged: true } });

const rejected = (
  failure: ProcessInboundEventExpectedFailure,
): CellOutcome<
  ProcessInboundEventResult,
  ProcessInboundEventExpectedFailure
> => ({ kind: 'failure', failure });

const valueOf = <Value>(outcome: CapabilityOutcome<Value, never>): Value => {
  if (outcome.kind === 'success') return outcome.value;
  throw outcome.failure;
};

export const makeExecuteProcessInboundEvent =
  (deps: ProcessInboundEventDependencies): ExecuteProcessInboundEvent =>
  async (event) => {
    const decision = decideCentsInboundEvent(event);
    if (decision.kind === 'ignore') return acknowledged();
    if (decision.kind === 'reject') return rejected(decision.failure);

    if (decision.kind === 'propose') {
      const locationId = valueOf(
        await deps.resolveSourceLocation({
          source: 'cents',
          externalLocationId: decision.order.externalStoreId,
        }),
      );
      if (locationId === null)
        return rejected(
          storedInboundEventFailure(
            'source_location_unmapped',
            'The external location is not mapped to a production location.',
          ),
        );

      const proposed = await deps.proposeIncomingOrder(
        toProposeIncomingOrderCommand({
          event,
          order: decision.order,
          locationId,
        }),
      );
      return proposed.kind === 'failure'
        ? rejected(ordersInboundFailure(proposed.failure))
        : acknowledged();
    }

    const closed = await deps.closeIncomingOrderSource(decision.command);
    if (closed.kind === 'failure')
      return rejected(ordersInboundFailure(closed.failure));
    if (closed.value.canonical === null) return acknowledged();

    const resolution = valueOf(
      await deps.resolveSourceClosedFulfillment({
        locationId: closed.value.canonical.locationId,
        fulfillmentId: closed.value.canonical.fulfillmentId,
        actorId: processInboundEventSystemActorId,
        idempotencyKey: `source-closed-fulfillment:${event.eventId}`,
      }),
    );
    return resolution.outcome === 'not_found'
      ? rejected(productionProjectionPendingFailure())
      : acknowledged();
  };
