import type { CommandContext } from '@pressly/kernel';
import type { OrderMutationResult } from '../../language/command-execution/order-command.model.ts';
import type { StoredOrderCommandReceipt } from '../../language/command-execution/order-command-receipt.model.ts';

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
