import { mapUnknownError, type AppError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { Clock } from '@pressly/time';
import type { WebhookInboxQueueStore } from '../../../foundations/ports/webhook-inbox-queue-store/webhook-inbox-queue-store.port.ts';
import type { ClaimWebhookEvents } from './claim-events.port.ts';

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
  (deps: { store: WebhookInboxQueueStore; clock: Clock }): ClaimWebhookEvents =>
  async (input) => {
    try {
      return await deps.store.claim({ ...input, now: deps.clock.now() });
    } catch (error) {
      throw claimStoreFailure(error);
    }
  };
