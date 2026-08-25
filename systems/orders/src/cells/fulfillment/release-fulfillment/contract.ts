import { z } from 'zod';
import {
  auditedCommandSchema,
  defineStrictCellContract,
  orderMutationResultSchema,
} from '../../../model/canonical-order/contract.ts';
import type { OrderMutationResult } from '../../../model/canonical-order/model.ts';
import type {
  ReleaseFulfillmentCommand,
  ReleaseFulfillmentExpectedFailure,
} from './types.ts';

const inputSchema = z
  .object({
    ...auditedCommandSchema,
    fulfillmentId: z.string(),
    locationId: z.string(),
    expectedOrderVersion: z.number(),
    expectedFulfillmentVersion: z.number(),
    reasonCode: z.enum(['ready_for_production', 'manager_override']),
  })
  .strict();

const failureSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('validation'),
      code: z.literal('fulfillment_release_command_invalid'),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('not_found'),
      code: z.literal('fulfillment_not_found'),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('conflict'),
      code: z.enum([
        'fulfillment_version_conflict',
        'fulfillment_transition_invalid',
        'order_idempotency_conflict',
      ]),
      message: z.string(),
    })
    .strict(),
]);

export const releaseFulfillmentContract = defineStrictCellContract<
  ReleaseFulfillmentCommand,
  OrderMutationResult,
  ReleaseFulfillmentExpectedFailure
>({
  inputSchema,
  outputSchema: orderMutationResultSchema,
  failureSchema,
  invariantCode: 'release_fulfillment_contract_invalid',
});
