import type { Result, UnitOfWork } from '@pressly/kernel';
import type {
  IncomingOrderProposal,
  IncomingOrderProposalTransition,
} from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.entity.ts';
import type {
  RestoreIncomingOrderProposalCommand,
  RestoreIncomingOrderProposalInput,
  RestoreIncomingOrderProposalResult,
} from './restore-incoming-order-proposal.model.ts';
import type { RestoreIncomingOrderProposalFailure } from './restore-incoming-order-proposal.failure.ts';

export type RestoreIncomingOrderProposal = (
  command: RestoreIncomingOrderProposalCommand,
) => Promise<
  Result<
    RestoreIncomingOrderProposalResult,
    RestoreIncomingOrderProposalFailure
  >
>;

export type RestoreIncomingOrderProposalOperations = Readonly<{
  lockCommand: (idempotencyKey: string) => Promise<void>;
  loadTransitionByIdempotencyKey: (
    idempotencyKey: string,
  ) => Promise<IncomingOrderProposalTransition | null>;
  loadProposal: (proposalId: string) => Promise<IncomingOrderProposal | null>;
  lockSource: (source: string, externalOrderId: string) => Promise<void>;
  lockProposal: (proposalId: string) => Promise<void>;
  restoreProposal: (
    input: RestoreIncomingOrderProposalInput,
  ) => Promise<RestoreIncomingOrderProposalResult>;
}>;

export type RestoreIncomingOrderProposalRepository =
  UnitOfWork<RestoreIncomingOrderProposalOperations>;
