import type { CommandContext } from '@pressly/kernel';
import type { UserCommandResult } from '../command-execution/user-command.port.ts';

export type UserTransactionPort<Operations> = Readonly<{
  transaction: <Value>(
    work: (operations: Operations) => Promise<Value>,
  ) => Promise<Value>;
}>;

export type StoredUserCommandReceipt = Readonly<{
  commandHash: string;
  result: UserCommandResult;
}>;

export type UserCommandOperations = Readonly<{
  lockCommand: (idempotencyKey: string) => Promise<void>;
  loadCommandReceipt: (
    idempotencyKey: string,
  ) => Promise<StoredUserCommandReceipt | null>;
  saveCommandReceipt: (input: {
    businessId: string;
    idempotencyKey: string;
    commandHash: string;
    context: CommandContext;
    value: UserCommandResult;
    now: Date;
  }) => Promise<void>;
}>;
