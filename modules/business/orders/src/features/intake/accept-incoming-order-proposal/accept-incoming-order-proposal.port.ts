import type { CommandContext, Result, ResultUnitOfWork } from '@pressly/kernel';
import type { OrderMutationResult } from '../../../foundations/language/command-execution/order-command.model.ts';
import type {
  ExactCanonicalOrder,
  IncomingOrderProposal,
  IncomingOrderProposalResolution,
} from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.entity.ts';
import type { IncomingOrderProposalDecisionResult } from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.model.ts';
import type { OrderCustomer } from '../../../foundations/language/order/order.model.ts';
import type { StoredOrderCommandReceipt } from '../../../foundations/language/command-execution/order-command-receipt.model.ts';
import type {
  AcceptIncomingOrderProposalCommand,
  AcceptIncomingOrderProposalInput,
} from './accept-incoming-order-proposal.model.ts';
import type {
  AcceptIncomingOrderProposalFailure,
  IncomingOrderProposalCustomerFailure,
} from './accept-incoming-order-proposal.failure.ts';

export type AcceptIncomingOrderProposal = (
  command: AcceptIncomingOrderProposalCommand,
) => Promise<
  Result<
    IncomingOrderProposalDecisionResult,
    AcceptIncomingOrderProposalFailure
  >
>;

export type AcceptIncomingOrderProposalOperations = Readonly<{
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
  findExactOrder: (
    source: string,
    externalOrderId: string,
  ) => Promise<ExactCanonicalOrder | null>;
  resolveOrCreateExactCustomer: (
    proposal: IncomingOrderProposal,
    now: Date,
    context: CommandContext,
  ) => Promise<Result<OrderCustomer, IncomingOrderProposalCustomerFailure>>;
  acceptProposal: (
    input: AcceptIncomingOrderProposalInput,
  ) => Promise<OrderMutationResult>;
}>;

export type AcceptIncomingOrderProposalRepository =
  ResultUnitOfWork<AcceptIncomingOrderProposalOperations>;
