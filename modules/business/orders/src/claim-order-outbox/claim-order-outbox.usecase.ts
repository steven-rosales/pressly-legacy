import {
  databaseError,
  mapUnknownError,
  validationError,
} from '@pressly/errors';
import { result } from '@pressly/kernel';
import type { OrderClockPort } from '../command-execution/order-command.port.ts';

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
        validationError({
          code: 'order_outbox_claim_invalid',
          message: 'The outbox claim request is invalid.',
          safeMessage: 'The outbox claim request is invalid.',
        }),
      );
    try {
      return result.ok(
        await deps.repo.claim({ command, now: deps.clock.now() }),
      );
    } catch (error) {
      return result.err(
        mapUnknownError(error, (unknownCause) =>
          databaseError({
            code: 'order_outbox_claim_failed',
            message:
              'Order changes are temporarily unavailable for processing.',
            safeMessage:
              'Order changes are temporarily unavailable for processing.',
            status: 503,
            cause: unknownCause,
          }),
        ),
      );
    }
  };
