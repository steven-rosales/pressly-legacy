import { z } from 'zod';
import {
  commandContextSchema,
  defineStrictCellContract,
} from '../../../model/canonical-order/contract.ts';
import type {
  RestoreIncomingOrderProposalCommand,
  RestoreIncomingOrderProposalExpectedFailure,
  RestoreIncomingOrderProposalResult,
} from './types.ts';

const inputSchema = z
  .object({
    proposalId: z.string(),
    locationId: z.string(),
    expectedVersion: z.number(),
    idempotencyKey: z.string(),
    context: commandContextSchema,
    reasonCode: z.literal('source_closure_overridden'),
    reasonNote: z.string().nullable(),
  })
  .strict();
const outputSchema = z
  .object({
    proposalId: z.string(),
    state: z.literal('restored_pending'),
    version: z.number().int(),
    replayed: z.boolean(),
  })
  .strict();
const failureSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('validation'),
      code: z.literal('incoming_order_proposal_restore_invalid'),
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

export const restoreIncomingOrderProposalContract = defineStrictCellContract<
  RestoreIncomingOrderProposalCommand,
  RestoreIncomingOrderProposalResult,
  RestoreIncomingOrderProposalExpectedFailure
>({
  inputSchema,
  outputSchema,
  failureSchema,
  invariantCode: 'restore_incoming_order_proposal_contract_invalid',
});
