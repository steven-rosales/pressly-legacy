import type * as orderSchema from '@pressly/db/schema/orders';
import { incomingOrderProposalInvariant } from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.error.ts';
import type { IncomingOrderProposalSummary } from './list-incoming-order-proposals.model.ts';

type ProposalRow = typeof orderSchema.orderSourceProposals.$inferSelect;
type TombstoneRow =
  | typeof orderSchema.orderSourceTerminalTombstones.$inferSelect
  | null;

const isTerminalCode = (value: string): value is 'completed' | 'canceled' =>
  value === 'completed' || value === 'canceled';

const sourceClosureFromRows = (
  proposal: ProposalRow,
  tombstone: TombstoneRow,
): IncomingOrderProposalSummary['sourceClosure'] => {
  if (proposal.state !== 'source_closed' || tombstone === null) return null;
  if (!isTerminalCode(tombstone.terminalCode))
    throw incomingOrderProposalInvariant(
      'INCOMING_ORDER_PROPOSAL_LIST_TOMBSTONE_INVALID',
      'Stored incoming proposal source closure is invalid.',
    );
  return {
    kind: tombstone.terminalCode,
    observedAt: tombstone.observedAt,
  };
};

export const incomingOrderProposalSummaryFromRows = (input: {
  proposal: ProposalRow;
  linkedOrderId: string | null;
  tombstone: TombstoneRow;
}): IncomingOrderProposalSummary => {
  const { proposal, linkedOrderId, tombstone } = input;
  if (
    proposal.state !== 'pending' &&
    proposal.state !== 'source_closed' &&
    proposal.state !== 'restored_pending'
  )
    throw incomingOrderProposalInvariant(
      'INCOMING_ORDER_PROPOSAL_LIST_STATE_INVALID',
      'Stored incoming proposal list state is invalid.',
    );
  if (tombstone !== null && !isTerminalCode(tombstone.terminalCode))
    throw incomingOrderProposalInvariant(
      'INCOMING_ORDER_PROPOSAL_LIST_TOMBSTONE_INVALID',
      'Stored incoming proposal source closure is invalid.',
    );

  return {
    id: proposal.id,
    version: proposal.version,
    state: proposal.state,
    source: proposal.source,
    externalOrderId: proposal.externalOrderId,
    locationId: proposal.locationId,
    displayNumber: proposal.displayNumber,
    customer:
      proposal.customerDisplayName === null &&
      proposal.customerPhone === null &&
      proposal.customerEmail === null
        ? null
        : {
            displayName: proposal.customerDisplayName,
            phone: proposal.customerPhone,
            email: proposal.customerEmail,
          },
    dueAt: proposal.dueAt,
    estimatedWeightLbs: proposal.estimatedWeightLbs,
    sourceReportedAt: proposal.sourceRevisionAt,
    reportedAt: proposal.observedAt,
    sourceClosure: sourceClosureFromRows(proposal, tombstone),
    availableActions:
      proposal.state === 'source_closed'
        ? ['restore']
        : linkedOrderId === null
          ? ['accept', 'reject']
          : ['reject'],
    acceptBlockedReason: linkedOrderId === null ? null : 'exact_order_exists',
  };
};
