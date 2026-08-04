import type { IncomingOrderProposalResolution } from './incoming-order-proposal.entity.ts';
import type { IncomingOrderProposalDecisionResult } from './incoming-order-proposal.model.ts';

export type IncomingOrderProposalResolutionReplay =
  | Readonly<{
      kind: 'replay';
      value: IncomingOrderProposalDecisionResult;
    }>
  | Readonly<{ kind: 'conflict' }>;

export const projectIncomingOrderProposalResolutionReplay = (
  proposalId: string,
  resolution: IncomingOrderProposalResolution | null,
  commandHash: string,
): IncomingOrderProposalResolutionReplay | null => {
  if (resolution === null) return null;

  return resolution.commandHash === commandHash
    ? {
        kind: 'replay',
        value: {
          proposalId,
          state: resolution.decision,
          version: resolution.proposalVersion,
          orderId: resolution.orderId,
          fulfillmentId: resolution.fulfillmentId,
          replayed: true,
        },
      }
    : { kind: 'conflict' };
};
