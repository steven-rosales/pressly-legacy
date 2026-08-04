import type { JsonObject } from '@pressly/codec';
import type {
  IncomingOrderProposalCustomer,
  IncomingOrderProposalSnapshot,
} from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.model.ts';
import type { ProposeIncomingOrderCommand } from './propose-incoming-order.model.ts';

export type IncomingOrderProposalSnapshotJson = Readonly<{
  order: Omit<IncomingOrderProposalSnapshot, 'dueAt'> &
    Readonly<{ dueAt: string }>;
  source: JsonObject;
}>;

export const incomingOrderProposalCustomerDisplayName = (
  customer: IncomingOrderProposalCustomer | null,
): string | null => {
  if (customer === null) return null;
  if (customer.businessName !== null && customer.businessName.trim() !== '')
    return customer.businessName.trim();

  const name = [customer.firstName, customer.lastName]
    .filter((part): part is string => part !== null && part.trim() !== '')
    .map((part) => part.trim())
    .join(' ');
  return name === '' ? null : name;
};

export const serializeIncomingOrderProposalSnapshot = (
  command: ProposeIncomingOrderCommand,
): IncomingOrderProposalSnapshotJson => ({
  order: {
    ...command.snapshot,
    dueAt: command.snapshot.dueAt.toISOString(),
  },
  source: command.revision.normalizedPayload,
});
