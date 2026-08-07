import type { RejectIncomingOrderProposalReasonCode } from './reject-incoming-order-proposal.model.ts';

export const rejectIncomingOrderProposalReasonCodes = Object.freeze([
  'already_handled',
  'duplicate_order',
  'not_pressly_work',
  'manager_rejected',
] as const satisfies readonly RejectIncomingOrderProposalReasonCode[]);

export const isRejectIncomingOrderProposalReasonCode = (
  value: string,
): value is RejectIncomingOrderProposalReasonCode =>
  rejectIncomingOrderProposalReasonCodes.some((reason) => reason === value);
