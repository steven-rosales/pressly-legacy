import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type {
  ClaimEventsClock,
  ClaimEventsCommand,
  ClaimEventsExpectedFailure,
  ClaimEventsRepository,
  ClaimEventsResult,
} from './types.ts';

export type ClaimEventsDependencies = Readonly<{
  repo: ClaimEventsRepository;
  clock: ClaimEventsClock;
}>;

export const makeExecuteClaimEvents =
  (deps: ClaimEventsDependencies) =>
  async (
    command: ClaimEventsCommand,
  ): Promise<CellOutcome<ClaimEventsResult, ClaimEventsExpectedFailure>> => {
    try {
      return {
        kind: 'success',
        value: await deps.repo.claim({ command, now: deps.clock.now() }),
      };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'webhook_event_claim_failed',
          message: 'Webhook events could not be claimed.',
          safeMessage: 'Webhook events could not be claimed.',
          status: 503,
          cause,
        }),
      );
    }
  };
