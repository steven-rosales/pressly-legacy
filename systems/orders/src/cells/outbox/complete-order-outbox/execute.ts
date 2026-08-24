import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type {
  CompleteOrderOutboxClock,
  CompleteOrderOutboxCommand,
  CompleteOrderOutboxExpectedFailure,
  CompleteOrderOutboxRepository,
  CompleteOrderOutboxResult,
} from './types.ts';

export type CompleteOrderOutboxDependencies = Readonly<{
  repo: CompleteOrderOutboxRepository;
  clock: CompleteOrderOutboxClock;
}>;

export const makeExecuteCompleteOrderOutbox =
  (dependencies: CompleteOrderOutboxDependencies) =>
  async (
    command: CompleteOrderOutboxCommand,
  ): Promise<
    CellOutcome<CompleteOrderOutboxResult, CompleteOrderOutboxExpectedFailure>
  > => {
    try {
      return {
        kind: 'success',
        value: {
          completed: await dependencies.repo.complete({
            command,
            now: dependencies.clock.now(),
          }),
        },
      };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'order_outbox_completion_failed',
          message: 'The processed order change could not be acknowledged.',
          safeMessage: 'The processed order change could not be acknowledged.',
          status: 503,
          cause,
        }),
      );
    }
  };
