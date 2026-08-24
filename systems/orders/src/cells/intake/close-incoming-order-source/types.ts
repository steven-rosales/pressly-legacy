import type { JsonObject } from '@pressly/codec';
import type { CommandContext } from '@pressly/cells/command-context';
import type {
  ExactCanonicalOrder,
  IncomingOrderProposal,
  IncomingOrderSourceTombstone,
} from '../../../model/incoming-order-proposal/model.ts';

export const closeIncomingOrderSourceOperationId =
  'orders.close-incoming-order-source.v1' as const;

export type CloseIncomingOrderSourceCommand = Readonly<{
  context: CommandContext;
  source: string;
  externalOrderId: string;
  terminalCode: 'completed' | 'canceled';
  revision: Readonly<{
    at: Date;
    hash: string;
    adapterVersion: string;
    observedAt: Date;
    normalizedPayload: JsonObject;
  }>;
}>;

export type CloseIncomingOrderSourceResult = Readonly<{
  outcome:
    | 'source_closed'
    | 'tombstoned'
    | 'existing_order'
    | 'already_decided'
    | 'already_source_closed';
  proposalId: string | null;
  version: number | null;
  canonical: Readonly<{
    orderId: string;
    fulfillmentId: string;
    locationId: string;
    releaseState: 'unreleased' | 'released' | 'withdrawn';
  }> | null;
  replayed: boolean;
}>;

export type CloseIncomingOrderSourceExpectedFailure =
  | Readonly<{
      kind: 'validation';
      code: 'incoming_order_source_close_invalid';
      message: string;
    }>
  | Readonly<{
      kind: 'conflict';
      code: 'order_idempotency_conflict';
      message: string;
    }>;

export type CloseIncomingOrderProposalInput = Readonly<{
  proposal: IncomingOrderProposal;
  command: CloseIncomingOrderSourceCommand;
  idempotencyKey: string;
  commandHash: string;
  closedAt: Date;
  transition: Readonly<{
    from: 'pending';
    to: 'source_closed';
    event: 'source_close';
    version: number;
  }>;
}>;

export type CloseIncomingOrderSourceTransactionRepository = Readonly<{
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

export type CloseIncomingOrderSourceRepository = Readonly<{
  transaction: <Value>(
    work: (
      repository: CloseIncomingOrderSourceTransactionRepository,
    ) => Promise<Value>,
  ) => Promise<Value>;
}>;

export type CloseIncomingOrderSourceClock = Readonly<{ now: () => Date }>;
