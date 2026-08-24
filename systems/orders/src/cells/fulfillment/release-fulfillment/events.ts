import { fulfillmentDemandChangedV2MessageContract } from '../../../contracts/fulfillment-demand-changed-v2.ts';

export const releaseFulfillmentEmittedMessages = Object.freeze([
  fulfillmentDemandChangedV2MessageContract,
] as const);
