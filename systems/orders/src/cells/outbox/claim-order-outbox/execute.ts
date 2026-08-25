import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { validateClaimOrderOutbox } from './decide.ts';
import type {
  ClaimOrderOutboxClock,
  ClaimOrderOutboxCommand,
  ClaimOrderOutboxExpectedFailure,
  ClaimOrderOutboxRepository,
  ClaimOrderOutboxResult,
} from './types.ts';

export type ClaimOrderOutboxDependencies = Readonly<{
  repo: ClaimOrderOutboxRepository;
  clock: ClaimOrderOutboxClock;
}>;

export const makeExecuteClaimOrderOutbox =
  (dependencies: ClaimOrderOutboxDependencies) =>
  async (
    command: ClaimOrderOutboxCommand,
  ): Promise<
    CellOutcome<ClaimOrderOutboxResult, ClaimOrderOutboxExpectedFailure>
  > => {
    const failure = validateClaimOrderOutbox(command);
    if (failure !== null) return { kind: 'failure', failure };

    try {
      return {
        kind: 'success',
        value: await dependencies.repo.claim({
          command,
          now: dependencies.clock.now(),
        }),
      };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'order_outbox_claim_failed',
          message: 'Order changes are temporarily unavailable for processing.',
          safeMessage:
            'Order changes are temporarily unavailable for processing.',
          status: 503,
          cause,
        }),
      );
    }
  };
