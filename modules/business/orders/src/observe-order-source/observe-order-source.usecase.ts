import { isCommandContextValid, result } from '@pressly/kernel';
import { orderError } from '../order.error.ts';
import { isOrderInputValid } from '../order-input.policy.ts';
import type { ObserveOrderSource } from '../orders.port.ts';
import type { ObserveOrderSourceRepository } from './observe-order-source.port.ts';
import { decideOrderSourceUpdate } from './observe-order-source.policy.ts';

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
          const created = await operations.createSourceOrder(command);
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

        await operations.applySourceOrder({
          current,
          observation: command,
          nextOrder: decision.value.nextOrder,
          nextFulfillment: decision.value.nextFulfillment,
          nextOrderVersion: decision.value.nextOrderVersion,
          nextFulfillmentVersion: decision.value.nextFulfillmentVersion,
          items: command.items,
          missingAuthorities: decision.value.missingAuthorities,
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
      if (outcome.kind === 'invalid_transition')
        return result.err(
          orderError(
            'ORDER_SOURCE_TRANSITION_INVALID',
            'The source attempted to reverse a terminal order or fulfillment state.',
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
