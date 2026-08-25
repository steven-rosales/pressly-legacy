import type { JsonObject } from '@pressly/codec';
import type { CommandContext } from '@pressly/cells/command-context';
import type {
  ExactCanonicalOrder,
  IncomingOrderProposal,
  IncomingOrderProposalSnapshot,
  IncomingOrderSourceTombstone,
} from '../../../model/incoming-order-proposal/model.ts';

export const proposeIncomingOrderOperationId =
  'orders.propose-incoming-order.v1' as const;

export type ProposeIncomingOrderCommand = Readonly<{
  context: CommandContext;
  source: string;
  externalOrderId: string;
  proposalKind: 'submitted_order';
  snapshot: IncomingOrderProposalSnapshot;
  revision: Readonly<{
    at: Date;
    hash: string;
    adapterVersion: string;
    observedAt: Date;
    normalizedPayload: JsonObject;
  }>;
}>;

export type ProposeIncomingOrderResult = Readonly<{
  proposalId: string | null;
  version: number | null;
  replayed: boolean;
  outcome:
    | 'proposed'
    | 'existing_proposal'
    | 'existing_order'
    | 'source_closed';
}>;

export type ProposeIncomingOrderExpectedFailure = Readonly<{
  kind: 'validation';
  code: 'incoming_order_proposal_invalid';
  message: string;
}>;

export type ProposeIncomingOrderTransactionRepository = Readonly<{
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

export type ProposeIncomingOrderRepository = Readonly<{
  transaction: <Value>(
    work: (
      repository: ProposeIncomingOrderTransactionRepository,
    ) => Promise<Value>,
  ) => Promise<Value>;
}>;
