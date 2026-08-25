import { z } from 'zod';
import {
  defineStrictCellContract,
  utcDateSchema,
} from '../../../model/canonical-order/contract.ts';
import type {
  IncomingOrderProposalListResult,
  ListIncomingOrderProposalsExpectedFailure,
  ListIncomingOrderProposalsQuery,
} from './types.ts';

const inputSchema = z
  .object({
    locationId: z.string(),
    limit: z.number(),
    cursor: z.string().nullable(),
    view: z.enum(['needs_review', 'source_closed']),
  })
  .strict();
const summarySchema = z
  .object({
    id: z.string(),
    version: z.number().int(),
    state: z.enum(['pending', 'source_closed', 'restored_pending']),
    source: z.string(),
    externalOrderId: z.string(),
    locationId: z.string(),
    displayNumber: z.string().nullable(),
    customer: z
      .object({
        displayName: z.string().nullable(),
        phone: z.string().nullable(),
        email: z.string().nullable(),
      })
      .strict()
      .nullable(),
    dueAt: utcDateSchema,
    estimatedWeightLbs: z.number().nullable(),
    sourceReportedAt: utcDateSchema,
    reportedAt: utcDateSchema,
    sourceClosure: z
      .object({
        kind: z.enum(['completed', 'canceled']),
        observedAt: utcDateSchema,
      })
      .strict()
      .nullable(),
    availableActions: z.array(
      z.enum(['accept', 'reject', 'source_close', 'restore']),
    ),
    acceptBlockedReason: z.literal('exact_order_exists').nullable(),
  })
  .strict();
const outputSchema = z
  .object({
    items: z.array(summarySchema),
    nextCursor: z.string().nullable(),
  })
  .strict();
const failureSchema = z
  .object({
    kind: z.literal('validation'),
    code: z.enum([
      'incoming_order_proposal_query_invalid',
      'incoming_order_proposal_cursor_invalid',
    ]),
    message: z.string(),
  })
  .strict();

export const listIncomingOrderProposalsContract = defineStrictCellContract<
  ListIncomingOrderProposalsQuery,
  IncomingOrderProposalListResult,
  ListIncomingOrderProposalsExpectedFailure
>({
  inputSchema,
  outputSchema,
  failureSchema,
  invariantCode: 'list_incoming_order_proposals_contract_invalid',
});
