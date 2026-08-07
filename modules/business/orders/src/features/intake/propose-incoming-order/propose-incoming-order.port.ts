import type { Result, UnitOfWork } from '@pressly/kernel';
import type {
  ExactCanonicalOrder,
  IncomingOrderProposal,
  IncomingOrderSourceTombstone,
} from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.entity.ts';
import type {
  IncomingOrderProposalMutationResult,
  ProposeIncomingOrderCommand,
} from './propose-incoming-order.model.ts';
import type { ProposeIncomingOrderFailure } from './propose-incoming-order.failure.ts';

export type ProposeIncomingOrder = (
  command: ProposeIncomingOrderCommand,
) => Promise<
  Result<IncomingOrderProposalMutationResult, ProposeIncomingOrderFailure>
>;

export type ProposeIncomingOrderOperations = Readonly<{
  lockSource: (source: string, externalOrderId: string) => Promise<void>;
  findExactOrder: (
    source: string,
    externalOrderId: string,
  ) => Promise<ExactCanonicalOrder | null>;
  findTombstone: (
    source: string,
    externalOrderId: string,
  ) => Promise<IncomingOrderSourceTombstone | null>;
  findProposal: (
    source: string,
    externalOrderId: string,
  ) => Promise<IncomingOrderProposal | null>;
  createProposal: (
    command: ProposeIncomingOrderCommand,
  ) => Promise<Readonly<{ proposalId: string }>>;
}>;

export type ProposeIncomingOrderRepository =
  UnitOfWork<ProposeIncomingOrderOperations>;
