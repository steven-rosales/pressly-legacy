import { webhookEventReadyV1MessageContract } from '../../../contracts/webhook-event-ready-v1.ts';

export const processInboundEventConsumedMessages = Object.freeze([
  webhookEventReadyV1MessageContract,
] as const);
