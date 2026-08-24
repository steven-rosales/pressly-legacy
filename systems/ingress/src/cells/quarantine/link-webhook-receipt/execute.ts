import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { linkWebhookReceiptFailure } from './decide.ts';
import type {
  LinkWebhookReceiptClock,
  LinkWebhookReceiptCommand,
  LinkWebhookReceiptExpectedFailure,
  LinkWebhookReceiptRepository,
  LinkWebhookReceiptResult,
} from './types.ts';

export type LinkWebhookReceiptDependencies = Readonly<{
  repo: LinkWebhookReceiptRepository;
  clock: LinkWebhookReceiptClock;
}>;

export const makeExecuteLinkWebhookReceipt =
  (deps: LinkWebhookReceiptDependencies) =>
  async (
    command: LinkWebhookReceiptCommand,
  ): Promise<
    CellOutcome<LinkWebhookReceiptResult, LinkWebhookReceiptExpectedFailure>
  > => {
    let outcome: Awaited<ReturnType<LinkWebhookReceiptRepository['link']>>;
    try {
      outcome = await deps.repo.link({
        ...command,
        linkedAt: deps.clock.now(),
      });
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'webhook_quarantine_link_failed',
          message: 'The webhook diagnostic receipt could not be linked.',
          safeMessage: 'The webhook diagnostic receipt could not be linked.',
          status: 503,
          cause,
        }),
      );
    }
    if (outcome === 'missing')
      return { kind: 'failure', failure: linkWebhookReceiptFailure.notFound() };
    if (outcome === 'conflict')
      return { kind: 'failure', failure: linkWebhookReceiptFailure.conflict() };
    return { kind: 'success', value: { linked: outcome === 'linked' } };
  };
