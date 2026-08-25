import type { ReplayDeadEventExpectedFailure } from './types.ts';

export const replayDeadEventFailure = Object.freeze({
  notFound: (): ReplayDeadEventExpectedFailure => ({
    kind: 'not_found',
    code: 'webhook_event_not_found',
    message: 'The webhook event was not found.',
    safeMessage: 'The webhook event was not found.',
  }),
  notReplayable: (): ReplayDeadEventExpectedFailure => ({
    kind: 'conflict',
    code: 'webhook_event_not_replayable',
    message: 'Only a dead or already queued webhook event can be replayed.',
    safeMessage: 'Only a dead or already queued webhook event can be replayed.',
  }),
});
