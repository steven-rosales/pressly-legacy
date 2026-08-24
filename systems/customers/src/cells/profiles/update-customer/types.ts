import type { CommandContext } from '@pressly/cells/command-context';
import type {
  Customer,
  CustomerCommandResult,
  CustomerProfile,
  CustomerProfileField,
  StoredCustomerCommandReceipt,
} from '../../../model/customer.ts';

export const updateCustomerOperationId =
  'customers.update-customer.v1' as const;

export type UpdateCustomerChanges = Partial<CustomerProfile> &
  Readonly<{ active?: boolean }>;

export type UpdateCustomerCommand = Readonly<{
  businessId: string;
  idempotencyKey: string;
  context: CommandContext;
  userId: string;
  expectedVersion: number;
  changes: UpdateCustomerChanges;
}>;

export type UpdateCustomerExpectedFailure =
  | Readonly<{ kind: 'validation'; code: 'user_update_invalid' }>
  | Readonly<{ kind: 'not_found'; code: 'user_not_found' }>
  | Readonly<{ kind: 'conflict'; code: 'user_version_conflict' }>
  | Readonly<{ kind: 'conflict'; code: 'user_idempotency_conflict' }>;

export type UpdateCustomerTransaction = Readonly<{
  lockCommand: (idempotencyKey: string) => Promise<void>;
  loadCommandReceipt: (
    idempotencyKey: string,
  ) => Promise<StoredCustomerCommandReceipt | null>;
  lockCustomer: (businessId: string, userId: string) => Promise<void>;
  loadCustomer: (
    businessId: string,
    userId: string,
  ) => Promise<Customer | null>;
  updateCustomer: (
    input: Readonly<{
      businessId: string;
      userId: string;
      changes: UpdateCustomerChanges;
      authorityFields: readonly CustomerProfileField[];
      nextVersion: number;
      now: Date;
    }>,
  ) => Promise<void>;
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

export type UpdateCustomerRepository = Readonly<{
  transaction: <Value>(
    work: (transaction: UpdateCustomerTransaction) => Promise<Value>,
  ) => Promise<Value>;
}>;

export type UpdateCustomerClock = Readonly<{ now: () => Date }>;
