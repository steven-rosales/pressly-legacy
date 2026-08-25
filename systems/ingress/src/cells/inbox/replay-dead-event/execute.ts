import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { ReplayDeadWebhookEventResult } from '../../../model/inbox.ts';
import { replayDeadEventFailure } from './decide.ts';
import type {
  ReplayDeadEventClock,
  ReplayDeadEventCommand,
  ReplayDeadEventExpectedFailure,
  ReplayDeadEventRepository,
} from './types.ts';

export type ReplayDeadEventDependencies = Readonly<{
  repo: ReplayDeadEventRepository;
  clock: ReplayDeadEventClock;
}>;

export const makeExecuteReplayDeadEvent =
  (deps: ReplayDeadEventDependencies) =>
  async (
    command: ReplayDeadEventCommand,
  ): Promise<
    CellOutcome<ReplayDeadWebhookEventResult, ReplayDeadEventExpectedFailure>
  > => {
    let replayed: Awaited<ReturnType<ReplayDeadEventRepository['replay']>>;
    try {
      replayed = await deps.repo.replay(command.eventId, deps.clock.now());
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'dead_webhook_event_replay_failed',
          message: 'The dead webhook event could not be replayed.',
          safeMessage: 'The dead webhook event could not be replayed.',
          status: 503,
          cause,
        }),
      );
    }
    if (replayed === 'not_found')
      return { kind: 'failure', failure: replayDeadEventFailure.notFound() };
    if (replayed === 'not_replayable')
      return {
        kind: 'failure',
        failure: replayDeadEventFailure.notReplayable(),
      };
    return {
      kind: 'success',
      value: { eventId: command.eventId, outcome: replayed },
    };
  };
