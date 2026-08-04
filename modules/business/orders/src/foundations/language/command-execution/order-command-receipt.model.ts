import type { OrderMutationResult } from './order-command.model.ts';

export type StoredOrderCommandReceipt = Readonly<{
  commandHash: string;
  result: OrderMutationResult;
}>;
