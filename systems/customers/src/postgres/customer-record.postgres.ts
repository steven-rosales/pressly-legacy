import type { PostgresExecutor } from '@pressly/postgres/client';
import { and, eq, ne, sql } from '@pressly/postgres/query';
import { invariantViolationError } from '@pressly/errors/factories';
import type { CommandContext } from '@pressly/cells/command-context';
import type {
  Customer,
  CustomerCommandResult,
  CustomerProfile,
  CustomerProfileField,
  StoredCustomerCommandReceipt,
} from '../model/customer.ts';
import type { CustomersSchema } from '../schema/customers.ts';

export type CustomerRecordSchema = Pick<
  CustomersSchema,
  | 'userCommandReceipts'
  | 'userDuplicateCandidates'
  | 'userFieldAuthorities'
  | 'users'
>;

const storedCustomerInvariant = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Stored user data is inconsistent.',
  });

export const mapStoredCustomer = (row: {
  id: string;
  businessId: string;
  version: number;
  active: boolean;
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  phone: string | null;
  email: string | null;
}): Customer => ({
  id: row.id,
  businessId: row.businessId,
  version: row.version,
  active: row.active,
  firstName: row.firstName,
  lastName: row.lastName,
  businessName: row.businessName,
  phone: row.phone,
  email: row.email,
});

export const lockCustomerPersistenceKey = async (
  database: PostgresExecutor,
  key: string,
): Promise<void> => {
  await database.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  );
};

export const loadCustomerCommandReceipt = async (
  database: PostgresExecutor,
  customers: Pick<CustomersSchema, 'userCommandReceipts'>,
  idempotencyKey: string,
): Promise<StoredCustomerCommandReceipt | null> => {
  const [row] = await database
    .select({
      commandHash: customers.userCommandReceipts.commandHash,
      result: customers.userCommandReceipts.result,
    })
    .from(customers.userCommandReceipts)
    .where(eq(customers.userCommandReceipts.idempotencyKey, idempotencyKey))
    .limit(1);

  if (row === undefined) return null;
  const stored = row.result;
  if (
    stored === null ||
    typeof stored !== 'object' ||
    !('userId' in stored) ||
    !('version' in stored) ||
    typeof stored.userId !== 'string' ||
    typeof stored.version !== 'number'
  )
    throw storedCustomerInvariant(
      'user_command_receipt_invalid',
      'Stored user command result is invalid.',
    );

  return {
    commandHash: row.commandHash,
    result: { userId: stored.userId, version: stored.version, replayed: false },
  };
};

export const saveCustomerCommandReceipt = async (
  database: PostgresExecutor,
  customers: Pick<CustomersSchema, 'userCommandReceipts'>,
  input: Readonly<{
    businessId: string;
    idempotencyKey: string;
    commandHash: string;
    context: CommandContext;
    value: CustomerCommandResult;
    now: Date;
  }>,
): Promise<void> => {
  await database.insert(customers.userCommandReceipts).values({
    businessId: input.businessId,
    idempotencyKey: input.idempotencyKey,
    commandHash: input.commandHash,
    origin: input.context.origin,
    actorKind: input.context.principal.kind,
    actorId: input.context.principal.id,
    userId: input.value.userId,
    result: input.value,
    createdAt: input.now,
  });
};

export const insertStoredCustomer = async (
  database: PostgresExecutor,
  customers: Pick<CustomersSchema, 'userFieldAuthorities' | 'users'>,
  input: Readonly<{
    businessId: string;
    profile: CustomerProfile;
    authorityFields: readonly CustomerProfileField[];
    now: Date;
  }>,
): Promise<Customer> => {
  const [created] = await database
    .insert(customers.users)
    .values({
      businessId: input.businessId,
      ...input.profile,
      version: 1,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning();

  if (created === undefined)
    throw storedCustomerInvariant(
      'user_insert_result_missing',
      'User insert returned no row.',
    );

  await database.insert(customers.userFieldAuthorities).values(
    input.authorityFields.map((fieldName) => ({
      userId: created.id,
      fieldName,
      authority: 'pressly',
      source: null,
      updatedAt: input.now,
    })),
  );

  return mapStoredCustomer(created);
};

export const signalPossibleDuplicateContacts = async (
  database: PostgresExecutor,
  customers: Pick<CustomersSchema, 'userDuplicateCandidates' | 'users'>,
  input: Readonly<{
    businessId: string;
    userId: string;
    profile: CustomerProfile;
    now: Date;
  }>,
): Promise<void> => {
  const candidates = new Map<string, Set<string>>();
  const record = (candidateId: string, reason: string): void => {
    const reasons = candidates.get(candidateId) ?? new Set<string>();
    reasons.add(reason);
    candidates.set(candidateId, reasons);
  };

  if (input.profile.phone !== null) {
    const matches = await database
      .select({ id: customers.users.id })
      .from(customers.users)
      .where(
        and(
          eq(customers.users.businessId, input.businessId),
          eq(customers.users.phone, input.profile.phone),
          ne(customers.users.id, input.userId),
        ),
      );
    for (const match of matches) record(match.id, 'same_phone');
  }

  if (input.profile.email !== null) {
    const matches = await database
      .select({ id: customers.users.id })
      .from(customers.users)
      .where(
        and(
          eq(customers.users.businessId, input.businessId),
          eq(customers.users.email, input.profile.email),
          ne(customers.users.id, input.userId),
        ),
      );
    for (const match of matches) record(match.id, 'same_email');
  }

  const rows = [...candidates.entries()].flatMap(([candidateUserId, reasons]) =>
    [...reasons].map((reason) => ({
      userId: input.userId,
      candidateUserId,
      reason,
      status: 'open',
      resolvedAt: null,
      createdAt: input.now,
      updatedAt: input.now,
    })),
  );

  if (rows.length > 0)
    await database
      .insert(customers.userDuplicateCandidates)
      .values(rows)
      .onConflictDoNothing();
};
