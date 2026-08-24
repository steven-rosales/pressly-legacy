import { and, eq } from '@pressly/postgres/query';
import type { WebhookEventClaim } from '../model/inbox.ts';
import type { IngressSchema } from '../schema/ingress.ts';

export const webhookEventClaimFence = (
  ingress: Pick<IngressSchema, 'webhookEvents'>,
  claim: WebhookEventClaim,
) =>
  and(
    eq(ingress.webhookEvents.id, claim.eventId),
    eq(ingress.webhookEvents.status, 'processing'),
    eq(ingress.webhookEvents.leaseOwner, claim.workerId),
    eq(ingress.webhookEvents.attempts, claim.attempt),
  );
