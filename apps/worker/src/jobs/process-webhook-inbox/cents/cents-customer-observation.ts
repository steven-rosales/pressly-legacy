import { createHash } from 'node:crypto';
import type { CentsCanonicalCustomerInput } from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { UsersApplication } from '@pressly/users';
import type { ClaimedWebhookEvent } from '@pressly/webhook-ingestion';

export const centsWebhookCommandContext = {
  origin: 'cents',
  principal: { kind: 'system', id: 'cents-webhook' },
} as const;

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  return value;
};

export const hashCentsCustomerObservation = (
  customer: CentsCanonicalCustomerInput,
): string =>
  createHash('sha256')
    .update(JSON.stringify(canonicalize(customer)))
    .digest('hex');

export type CentsCustomerObservationOutcome =
  | Readonly<{ tag: 'ok'; userId: string }>
  | Readonly<{ tag: 'err'; error: AppError; retryable: boolean }>;

export const observeCentsCustomer = async (input: {
  users: UsersApplication;
  event: ClaimedWebhookEvent;
  customer: CentsCanonicalCustomerInput;
  fallbackRevisionAt: string;
}): Promise<CentsCustomerObservationOutcome> => {
  const observed = await input.users.observeSource({
    context: centsWebhookCommandContext,
    source: 'cents',
    externalUserId: input.customer.externalUserId,
    profile: {
      firstName: input.customer.firstName,
      lastName: input.customer.lastName,
      businessName: input.customer.businessName,
      phone: input.customer.phone,
      email: input.customer.email,
    },
    revision: {
      at: new Date(input.customer.sourceUpdatedAt ?? input.fallbackRevisionAt),
      hash: hashCentsCustomerObservation(input.customer),
      adapterVersion: 'cents-webhook-v2',
      observedAt: new Date(input.event.receivedAt),
      normalizedPayload: input.customer.sourceSnapshot,
    },
  });
  if (observed.tag === 'ok')
    return { tag: 'ok', userId: observed.value.userId };
  return {
    tag: 'err',
    error: observed.error,
    retryable: observed.error.status >= 500,
  };
};
