import { result } from '@pressly/kernel';
import type { OrderClockPort } from '../command-execution/order-command.port.ts';
import { orderError } from '../failure-mapping/order.error.ts';
import type { ClaimOrderOutbox } from '../order-outbox/order-outbox.port.ts';
import type { ClaimOrderOutboxRepository } from './claim-order-outbox.port.ts';

export const makeClaimOrderOutbox =
  (deps: {
    repo: ClaimOrderOutboxRepository;
    clock: OrderClockPort;
  }): ClaimOrderOutbox =>
  async (command) => {
    if (
      command.workerId.trim() === '' ||
      !Number.isInteger(command.limit) ||
      command.limit < 1 ||
      command.limit > 100 ||
      command.leaseMs < 1_000
    )
      return result.err(
        orderError(
          'ORDER_OUTBOX_CLAIM_INVALID',
          'The outbox claim request is invalid.',
          400,
        ),
      );
    try {
      return result.ok(
        await deps.repo.claim({ command, now: deps.clock.now() }),
      );
    } catch (error) {
      return result.err(
        orderError(
          'ORDER_OUTBOX_CLAIM_FAILED',
          'Order changes are temporarily unavailable for processing.',
          503,
          error,
        ),
      );
    }
  };
