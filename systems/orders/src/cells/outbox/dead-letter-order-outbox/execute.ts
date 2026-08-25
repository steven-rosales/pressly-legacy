import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { validateDeadLetterOrderOutbox } from './decide.ts';
import type {
  DeadLetterOrderOutboxClock,
  DeadLetterOrderOutboxCommand,
  DeadLetterOrderOutboxExpectedFailure,
  DeadLetterOrderOutboxRepository,
  DeadLetterOrderOutboxResult,
} from './types.ts';

export type DeadLetterOrderOutboxDependencies = Readonly<{
  repo: DeadLetterOrderOutboxRepository;
  clock: DeadLetterOrderOutboxClock;
}>;

export const makeExecuteDeadLetterOrderOutbox =
  (dependencies: DeadLetterOrderOutboxDependencies) =>
  async (
    command: DeadLetterOrderOutboxCommand,
  ): Promise<
    CellOutcome<
      DeadLetterOrderOutboxResult,
      DeadLetterOrderOutboxExpectedFailure
    >
  > => {
    const failure = validateDeadLetterOrderOutbox(command);
    if (failure !== null) return { kind: 'failure', failure };

    try {
      return {
        kind: 'success',
        value: {
          deadLettered: await dependencies.repo.deadLetter({
            command,
            now: dependencies.clock.now(),
          }),
        },
      };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'order_outbox_dead_letter_failed',
          message: 'The order change could not be terminalized.',
          safeMessage: 'The order change could not be terminalized.',
          status: 503,
          cause,
        }),
      );
    }
  };
