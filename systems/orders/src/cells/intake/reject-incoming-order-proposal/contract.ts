import { z } from 'zod';
import {
  commandContextSchema,
  defineStrictCellContract,
} from '../../../model/canonical-order/contract.ts';
import type { IncomingOrderProposalDecisionResult } from '../../../model/incoming-order-proposal/model.ts';
import type {
  RejectIncomingOrderProposalCommand,
  RejectIncomingOrderProposalExpectedFailure,
} from './types.ts';

const inputSchema = z
  .object({
    proposalId: z.string(),
    locationId: z.string(),
    expectedVersion: z.number(),
    idempotencyKey: z.string(),
    context: commandContextSchema,
    reasonCode: z.enum([
      'already_handled',
      'duplicate_order',
      'not_pressly_work',
      'manager_rejected',
    ]),
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
      code: z.literal('incoming_order_proposal_reject_invalid'),
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
        'order_idempotency_conflict',
      ]),
      message: z.string(),
    })
    .strict(),
]);

export const rejectIncomingOrderProposalContract = defineStrictCellContract<
  RejectIncomingOrderProposalCommand,
  IncomingOrderProposalDecisionResult,
  RejectIncomingOrderProposalExpectedFailure
>({
  inputSchema,
  outputSchema,
  failureSchema,
  invariantCode: 'reject_incoming_order_proposal_contract_invalid',
});
