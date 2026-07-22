import { centsCanonicalMarketingInputSchema } from '@pressly/contracts';
import { makeAppError } from '@pressly/errors';
import type { UsersApplication } from '@pressly/users';
import type { ClaimedWebhookEvent } from '@pressly/webhook-ingestion';
import type {
  EventConsumerOutcome,
  WebhookEventConsumer,
} from '../webhook-inbox.job.ts';
import {
  centsWebhookCommandContext,
  observeCentsCustomer,
} from './cents-customer-observation.ts';

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

export const makeCentsMarketingHandler =
  (deps: { users: UsersApplication }): WebhookEventConsumer =>
  async (event: ClaimedWebhookEvent): Promise<EventConsumerOutcome> => {
    const parsed = centsCanonicalMarketingInputSchema.safeParse(event.payload);
    if (!parsed.success)
      return invalid(
        'cents_marketing_payload_invalid',
        'The stored Cents marketing payload is invalid.',
      );
    if (event.subjectId !== parsed.data.customer.externalUserId)
      return invalid(
        'cents_marketing_identity_invalid',
        'The stored Cents marketing identity is inconsistent.',
      );

    const observed = await observeCentsCustomer({
      users: deps.users,
      event,
      customer: parsed.data.customer,
      fallbackRevisionAt: event.receivedAt,
    });
    if (observed.tag === 'err') return observed;
    const recorded = await deps.users.recordConsent({
      context: centsWebhookCommandContext,
      source: 'cents',
      externalUserId: parsed.data.customer.externalUserId,
      idempotencyKey: `webhook:${event.eventId}:marketing_opt_in`,
      kind: 'marketing',
      granted: parsed.data.granted,
      observedAt: new Date(event.receivedAt),
      sourcePayloadHash: event.payloadHash,
    });
    if (recorded.tag === 'ok') return { tag: 'ok' };
    return {
      tag: 'err',
      error: recorded.error,
      retryable: recorded.error.status >= 500,
    };
  };
