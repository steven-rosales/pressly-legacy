import { isCommandContextValid, result } from '@pressly/kernel';
import { orderError } from '../order.error.ts';
import { isOrderInputValid } from '../order-input.policy.ts';
import type { ObserveOrderSource } from '../orders.port.ts';
import type { ObserveOrderSourceRepository } from './observe-order-source.port.ts';
import {
  canonicalOrderForNewSource,
  decideOrderSourceUpdate,
} from './observe-order-source.policy.ts';

export const makeObserveOrderSource =
  (repo: ObserveOrderSourceRepository): ObserveOrderSource =>
  async (command) => {
    if (
      command.source.trim() === '' ||
      !isCommandContextValid(command.context) ||
      command.externalOrderId.trim() === '' ||
      command.revision.adapterVersion.trim() === '' ||
      (command.revision.lifecycleCode !== null &&
        command.revision.lifecycleCode.trim() === '') ||
      !/^[a-f0-9]{64}$/.test(command.revision.hash) ||
      !isOrderInputValid(command)
    )
      return result.err(
        orderError(
          'ORDER_SOURCE_OBSERVATION_INVALID',
          'The order source observation is incomplete.',
          400,
        ),
      );
    try {
      const outcome = await repo.transaction(async (operations) => {
        await operations.lockSource(command);
        const current = await operations.loadSource(command);
        if (current === null) {
          const created = await operations.createSourceOrder({
            observation: command,
            canonical: canonicalOrderForNewSource(command),
          });
          return {
            kind: 'ok' as const,
            value: { ...created, outcome: 'created' as const },
          };
        }

        const decision = decideOrderSourceUpdate({
          current,
          observation: command,
        });
        if (decision.tag === 'err') return { kind: decision.error } as const;
        if (decision.value.kind === 'replay' || decision.value.kind === 'stale')
          return {
            kind: 'ok' as const,
            value: {
              orderId: current.order.id,
              fulfillmentId: current.fulfillment.id,
              version: current.order.version,
              replayed: decision.value.kind === 'replay',
              outcome:
                decision.value.kind === 'replay'
                  ? ('replayed' as const)
                  : ('stale' as const),
            },
          };

        await operations.retainSourceObservation({
          current,
          observation: command,
          missingAuthorities: decision.value.missingAuthorities,
        });
        if (decision.value.kind === 'observed_only')
          return {
            kind: 'ok' as const,
            value: {
              orderId: current.order.id,
              fulfillmentId: current.fulfillment.id,
              version: current.order.version,
              replayed: false,
              outcome: 'observed_only' as const,
            },
          };

        await operations.applySourceAdoption({
          current,
          observedAt: command.revision.observedAt,
          nextOrder: decision.value.nextOrder,
          nextFulfillment: decision.value.nextFulfillment,
          nextOrderVersion: decision.value.nextOrderVersion,
          nextFulfillmentVersion: decision.value.nextFulfillmentVersion,
          items: decision.value.items,
        });
        return {
          kind: 'ok' as const,
          value: {
            orderId: current.order.id,
            fulfillmentId: current.fulfillment.id,
            version: decision.value.nextOrderVersion,
            replayed: false,
            outcome: 'applied' as const,
          },
        };
      });
      if (outcome.kind === 'ok') return result.ok(outcome.value);
      if (outcome.kind === 'source_conflict')
        return result.err(
          orderError(
            'ORDER_SOURCE_REVISION_CONFLICT',
            'The source sent different order data for the same revision.',
          ),
        );
      return result.err(
        orderError(
          'ORDER_SOURCE_OBSERVATION_FAILED',
          'The order source observation could not be applied.',
        ),
      );
    } catch (error) {
      return result.err(
        orderError(
          'ORDER_SOURCE_OBSERVATION_FAILED',
          'The order source observation could not be stored.',
          503,
          error,
        ),
      );
    }
  };
