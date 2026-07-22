import { centsCanonicalCustomerInputSchema } from '@pressly/contracts';
import { makeAppError } from '@pressly/errors';
import type { UsersApplication } from '@pressly/users';
import type { ClaimedWebhookEvent } from '@pressly/webhook-ingestion';
import type {
  EventConsumerOutcome,
  WebhookEventConsumer,
} from '../webhook-inbox.job.ts';
import { observeCentsCustomer } from './cents-customer-observation.ts';

const invalid = (code: string, message: string): EventConsumerOutcome => ({
  tag: 'err',
  retryable: false,
  error: makeAppError({
    kind: 'ValidationError',
    code,
    message,
    safeMessage: message,
    status: 422,
  }),
});

export const makeCentsCustomerHandler =
  (deps: { users: UsersApplication }): WebhookEventConsumer =>
  async (event: ClaimedWebhookEvent): Promise<EventConsumerOutcome> => {
    const parsed = centsCanonicalCustomerInputSchema.safeParse(event.payload);
    if (!parsed.success)
      return invalid(
        'cents_customer_payload_invalid',
        'The stored Cents customer payload is invalid.',
      );
    if (event.subjectId !== parsed.data.externalUserId)
      return invalid(
        'cents_customer_identity_invalid',
        'The stored Cents customer identity is inconsistent.',
      );
    if (
      parsed.data.sourceUpdatedAt !== null &&
      event.sourceOccurredAt !== parsed.data.sourceUpdatedAt
    )
      return invalid(
        'cents_customer_revision_invalid',
        'The stored Cents customer revision is inconsistent.',
      );

    const outcome = await observeCentsCustomer({
      users: deps.users,
      event,
      customer: parsed.data,
      fallbackRevisionAt: event.receivedAt,
    });
    return outcome.tag === 'ok' ? { tag: 'ok' } : outcome;
  };
