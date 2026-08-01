import type { CommandContext } from '@pressly/kernel';
import type { OrderMutationResult } from '../command-execution/order-command.port.ts';

export type OrderTransactionPort<Operations> = Readonly<{
  transaction: <Value>(
    work: (operations: Operations) => Promise<Value>,
  ) => Promise<Value>;
}>;

export type StoredOrderCommandReceipt = Readonly<{
  commandHash: string;
  result: OrderMutationResult;
}>;

export type OrderCommandOperations = Readonly<{
  lockCommand: (idempotencyKey: string) => Promise<void>;
  loadCommandReceipt: (
    idempotencyKey: string,
  ) => Promise<StoredOrderCommandReceipt | null>;
  saveCommandReceipt: (input: {
    idempotencyKey: string;
    commandHash: string;
    context: CommandContext;
    reasonCode: string;
    reasonNote: string | null;
    value: OrderMutationResult;
    now: Date;
  }) => Promise<void>;
}>;
