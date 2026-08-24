import { webhookEventReadyV1MessageContract } from '../../../contracts/webhook-event-ready-v1.ts';

export const ingestEventMessages = Object.freeze([
  webhookEventReadyV1MessageContract,
] as const);
