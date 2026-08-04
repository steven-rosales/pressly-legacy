import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';

import type {
  ClaimOrderOutbox,
  ClaimOrderOutboxRepository,
} from './claim-order-outbox.port.ts';
import { claimOrderOutboxFailure } from './claim-order-outbox.failure.ts';

export const makeClaimOrderOutbox =
  (deps: {
    repo: ClaimOrderOutboxRepository;
    clock: Clock;
  }): ClaimOrderOutbox =>
  async (command) => {
    if (
      command.workerId.trim() === '' ||
      !Number.isInteger(command.limit) ||
      command.limit < 1 ||
      command.limit > 100 ||
      command.leaseMs < 1_000
    )
      return result.err(claimOrderOutboxFailure.invalid());
    try {
      return result.ok(
        await deps.repo.claim({ command, now: deps.clock.now() }),
      );
    } catch (error) {
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'order_outbox_claim_failed',
          message: 'Order changes are temporarily unavailable for processing.',
          safeMessage:
            'Order changes are temporarily unavailable for processing.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };
