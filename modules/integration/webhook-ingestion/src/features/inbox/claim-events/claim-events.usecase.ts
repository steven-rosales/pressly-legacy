import { mapUnknownError, type AppError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { Clock } from '@pressly/time';
import type {
  ClaimWebhookEvents,
  ClaimWebhookEventsRepository,
} from './claim-events.port.ts';

const claimStoreFailure = (cause: unknown): AppError =>
  mapUnknownError(cause, (unknownCause) =>
    databaseError({
      code: 'webhook_event_claim_failed',
      message: 'Webhook events could not be claimed.',
      safeMessage: 'Webhook events could not be claimed.',
      status: 503,
      cause: unknownCause,
    }),
  );

export const makeClaimWebhookEvents =
  (deps: {
    repo: ClaimWebhookEventsRepository;
    clock: Clock;
  }): ClaimWebhookEvents =>
  async (input) => {
    try {
      return await deps.repo({ ...input, now: deps.clock.now() });
    } catch (error) {
      throw claimStoreFailure(error);
    }
  };
