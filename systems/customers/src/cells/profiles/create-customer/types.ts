import type { CommandContext } from '@pressly/cells/command-context';
import type {
  Customer,
  CustomerCommandResult,
  CustomerProfile,
  CustomerProfileField,
  StoredCustomerCommandReceipt,
} from '../../../model/customer.ts';

export const createCustomerOperationId =
  'customers.create-customer.v1' as const;

export type CreateCustomerCommand = Readonly<{
  businessId: string;
  idempotencyKey: string;
  context: CommandContext;
  profile: CustomerProfile;
}>;

export type CreateCustomerExpectedFailure =
  | Readonly<{
      kind: 'validation';
      code: 'user_idempotency_key_required';
    }>
  | Readonly<{
      kind: 'conflict';
      code: 'user_idempotency_conflict';
    }>;

export type CreateCustomerTransaction = Readonly<{
  lockCommand: (idempotencyKey: string) => Promise<void>;
  loadCommandReceipt: (
    idempotencyKey: string,
  ) => Promise<StoredCustomerCommandReceipt | null>;
  createCustomer: (
    input: Readonly<{
      businessId: string;
      profile: CustomerProfile;
      authorityFields: readonly CustomerProfileField[];
      now: Date;
    }>,
  ) => Promise<Customer>;
  saveCommandReceipt: (
    input: Readonly<{
      businessId: string;
      idempotencyKey: string;
      commandHash: string;
      context: CommandContext;
      value: CustomerCommandResult;
      now: Date;
    }>,
  ) => Promise<void>;
  signalDuplicateContacts: (
    input: Readonly<{
      businessId: string;
      userId: string;
      profile: CustomerProfile;
      now: Date;
    }>,
  ) => Promise<void>;
}>;

export type CreateCustomerRepository = Readonly<{
  transaction: <Value>(
    work: (transaction: CreateCustomerTransaction) => Promise<Value>,
  ) => Promise<Value>;
}>;

export type CreateCustomerClock = Readonly<{ now: () => Date }>;
