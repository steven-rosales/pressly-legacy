import { mapUnknownError, type AppError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import { linkWebhookReceiptFailure } from './link-webhook-receipt.failure.ts';
import type {
  LinkWebhookReceipt,
  LinkWebhookReceiptRepository,
} from './link-webhook-receipt.port.ts';

const quarantineLinkFailure = (cause: unknown): AppError =>
  mapUnknownError(cause, (unknownCause) =>
    databaseError({
      code: 'webhook_quarantine_link_failed',
      message: 'The webhook diagnostic receipt could not be linked.',
      safeMessage: 'The webhook diagnostic receipt could not be linked.',
      status: 503,
      cause: unknownCause,
    }),
  );

export const makeLinkWebhookReceipt =
  (deps: {
    repo: LinkWebhookReceiptRepository;
    clock: Clock;
  }): LinkWebhookReceipt =>
  async (command) => {
    try {
      const outcome = await deps.repo({
        ...command,
        linkedAt: deps.clock.now(),
      });
      if (outcome === 'missing')
        return result.err(linkWebhookReceiptFailure.notFound());
      if (outcome === 'conflict')
        return result.err(linkWebhookReceiptFailure.conflict());
      return result.ok({ linked: outcome === 'linked' });
    } catch (error) {
      throw quarantineLinkFailure(error);
    }
  };
