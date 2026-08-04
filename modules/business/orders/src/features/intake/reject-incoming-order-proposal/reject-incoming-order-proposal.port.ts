import type { Result, UnitOfWork } from '@pressly/kernel';
import type {
  IncomingOrderProposal,
  IncomingOrderProposalResolution,
} from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.entity.ts';
import type { IncomingOrderProposalDecisionResult } from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.model.ts';
import type { IncomingOrderProposalResolutionInput } from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal-resolution.model.ts';
import type { StoredOrderCommandReceipt } from '../../../foundations/language/command-execution/order-command-receipt.model.ts';
import type { RejectIncomingOrderProposalCommand } from './reject-incoming-order-proposal.model.ts';
import type { RejectIncomingOrderProposalFailure } from './reject-incoming-order-proposal.failure.ts';

export type RejectIncomingOrderProposal = (
  command: RejectIncomingOrderProposalCommand,
) => Promise<
  Result<
    IncomingOrderProposalDecisionResult,
    RejectIncomingOrderProposalFailure
  >
>;

export type RejectIncomingOrderProposalOperations = Readonly<{
  lockCommand: (idempotencyKey: string) => Promise<void>;
  loadResolutionByIdempotencyKey: (
    idempotencyKey: string,
  ) => Promise<
    (IncomingOrderProposalResolution & Readonly<{ proposalId: string }>) | null
  >;
  loadCanonicalOrderCommandReceipt: (
    idempotencyKey: string,
  ) => Promise<StoredOrderCommandReceipt | null>;
  loadProposal: (proposalId: string) => Promise<IncomingOrderProposal | null>;
  lockSource: (source: string, externalOrderId: string) => Promise<void>;
  lockProposal: (proposalId: string) => Promise<void>;
  rejectProposal: (
    input: IncomingOrderProposalResolutionInput,
  ) => Promise<void>;
}>;

export type RejectIncomingOrderProposalRepository =
  UnitOfWork<RejectIncomingOrderProposalOperations>;
