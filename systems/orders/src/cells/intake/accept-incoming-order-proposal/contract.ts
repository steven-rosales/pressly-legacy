import { z } from 'zod';
import {
  commandContextSchema,
  defineStrictCellContract,
} from '../../../model/canonical-order/contract.ts';
import type { IncomingOrderProposalDecisionResult } from '../../../model/incoming-order-proposal/model.ts';
import type {
  AcceptIncomingOrderProposalCommand,
  AcceptIncomingOrderProposalExpectedFailure,
} from './types.ts';

const inputSchema = z
  .object({
    proposalId: z.string(),
    locationId: z.string(),
    expectedVersion: z.number(),
    idempotencyKey: z.string(),
    context: commandContextSchema,
    reasonCode: z.literal('incoming_order_accepted'),
    reasonNote: z.string().nullable(),
  })
  .strict();
const outputSchema = z
  .object({
    proposalId: z.string(),
    state: z.enum(['accepted', 'rejected']),
    version: z.number().int(),
    orderId: z.string().nullable(),
    fulfillmentId: z.string().nullable(),
    replayed: z.boolean(),
  })
  .strict();
const failureSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('validation'),
      code: z.literal('incoming_order_proposal_accept_invalid'),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('not_found'),
      code: z.literal('incoming_order_proposal_not_found'),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('conflict'),
      code: z.enum([
        'incoming_order_proposal_version_conflict',
        'incoming_order_proposal_transition_invalid',
        'incoming_order_proposal_identity_conflict',
        'order_idempotency_conflict',
        'canonical_source_user_business_conflict',
        'user_idempotency_conflict',
      ]),
      message: z.string(),
    })
    .strict(),
]);

export const acceptIncomingOrderProposalContract = defineStrictCellContract<
  AcceptIncomingOrderProposalCommand,
  IncomingOrderProposalDecisionResult,
  AcceptIncomingOrderProposalExpectedFailure
>({
  inputSchema,
  outputSchema,
  failureSchema,
  invariantCode: 'accept_incoming_order_proposal_contract_invalid',
});
