import type { z } from 'zod';
import {
  acceptIncomingOrderProposalHttpBodySchema,
  incomingOrderProposalDecisionHttpResultSchema,
  incomingOrderProposalListHttpResultSchema,
  rejectIncomingOrderProposalHttpBodySchema,
  restoreIncomingOrderProposalHttpBodySchema,
  restoreIncomingOrderProposalHttpResultSchema,
} from '../model/order-management-http.ts';

export {
  acceptIncomingOrderProposalHttpBodySchema,
  incomingOrderProposalDecisionHttpResultSchema,
  incomingOrderProposalListHttpResultSchema,
  rejectIncomingOrderProposalHttpBodySchema,
  restoreIncomingOrderProposalHttpBodySchema,
  restoreIncomingOrderProposalHttpResultSchema,
};

export type AcceptIncomingOrderProposalHttpBody = z.output<
  typeof acceptIncomingOrderProposalHttpBodySchema
>;
export type RejectIncomingOrderProposalHttpBody = z.output<
  typeof rejectIncomingOrderProposalHttpBodySchema
>;
export type RestoreIncomingOrderProposalHttpBody = z.output<
  typeof restoreIncomingOrderProposalHttpBodySchema
>;

export type IncomingOrderProposalListHttpResult = z.output<
  typeof incomingOrderProposalListHttpResultSchema
>;
export type IncomingOrderProposalDecisionHttpResult = z.output<
  typeof incomingOrderProposalDecisionHttpResultSchema
>;
export type RestoreIncomingOrderProposalHttpResult = z.output<
  typeof restoreIncomingOrderProposalHttpResultSchema
>;
