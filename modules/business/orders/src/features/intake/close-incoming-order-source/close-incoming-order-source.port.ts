import type { Result, UnitOfWork } from '@pressly/kernel';
import type {
  ExactCanonicalOrder,
  IncomingOrderProposal,
  IncomingOrderSourceTombstone,
} from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.entity.ts';
import type {
  CloseIncomingOrderProposalInput,
  CloseIncomingOrderSourceCommand,
  CloseIncomingOrderSourceResult,
} from './close-incoming-order-source.model.ts';
import type { CloseIncomingOrderSourceFailure } from './close-incoming-order-source.failure.ts';

export type CloseIncomingOrderSource = (
  command: CloseIncomingOrderSourceCommand,
) => Promise<
  Result<CloseIncomingOrderSourceResult, CloseIncomingOrderSourceFailure>
>;

export type CloseIncomingOrderSourceOperations = Readonly<{
  lockSource: (source: string, externalOrderId: string) => Promise<void>;
  findExactOrder: (
    source: string,
    externalOrderId: string,
  ) => Promise<ExactCanonicalOrder | null>;
  findProposal: (
    source: string,
    externalOrderId: string,
  ) => Promise<IncomingOrderProposal | null>;
  lockProposal: (proposalId: string) => Promise<void>;
  findTombstone: (
    source: string,
    externalOrderId: string,
  ) => Promise<IncomingOrderSourceTombstone | null>;
  createTombstone: (
    command: CloseIncomingOrderSourceCommand,
    proposalId: string | null,
  ) => Promise<IncomingOrderSourceTombstone>;
  closeProposal: (
    input: CloseIncomingOrderProposalInput,
  ) => Promise<CloseIncomingOrderSourceResult>;
}>;

export type CloseIncomingOrderSourceRepository =
  UnitOfWork<CloseIncomingOrderSourceOperations>;
