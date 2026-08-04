import type { ClaimedWebhookEvent } from '../../../foundations/language/inbox/webhook-inbox.model.ts';

export type ClaimWebhookEvents = (input: {
  workerId: string;
  leaseMs: number;
  limit: number;
}) => Promise<readonly ClaimedWebhookEvent[]>;
