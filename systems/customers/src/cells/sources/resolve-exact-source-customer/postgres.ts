import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { and, eq } from '@pressly/postgres/query';
import { invariantViolationError } from '@pressly/errors/factories';
import {
  customerProfileFields,
  type CustomerCommandResult,
} from '../../../model/customer.ts';
import {
  insertStoredCustomer,
  loadCustomerCommandReceipt,
  lockCustomerPersistenceKey,
  mapStoredCustomer,
  saveCustomerCommandReceipt,
  signalPossibleDuplicateContacts,
  type CustomerRecordSchema,
} from '../../../postgres/customer-record.postgres.ts';
import type { CustomersSchema } from '../../../schema/customers.ts';
import { resolveExactSourceCustomerCommandHash } from './idempotency.ts';
import { projectCustomerReferenceV1 } from '../../../model/customer-reference.ts';
import type {
  ResolveExactSourceCustomerCommand,
  ResolveExactSourceCustomerExpectedFailure,
  ResolveExactSourceCustomerRepository,
  ResolveExactSourceCustomerResult,
} from './types.ts';

type ResolveOutcome =
  | Readonly<{ kind: 'success'; value: ResolveExactSourceCustomerResult }>
  | Readonly<{
      kind: 'failure';
      failure: ResolveExactSourceCustomerExpectedFailure;
    }>;

export type ResolveExactSourceCustomerSchema = CustomerRecordSchema &
  Pick<CustomersSchema, 'userSourceLinks' | 'userSourceSnapshots'>;

const throwSourceCustomerInvariant = (code: string, message: string): never => {
  throw invariantViolationError({
    code,
    message,
    safeMessage: 'Stored user data is inconsistent.',
  });
};

export const resolveExactSourceCustomerInTransaction = async (
  transaction: PostgresExecutor,
  customers: ResolveExactSourceCustomerSchema,
  command: ResolveExactSourceCustomerCommand,
): Promise<ResolveOutcome> => {
  await lockCustomerPersistenceKey(
    transaction,
    `users:source:${command.source}:${command.externalUserId}`,
  );

  const [existing] = await transaction
    .select({
      id: customers.users.id,
      businessId: customers.users.businessId,
      version: customers.users.version,
      active: customers.users.active,
      firstName: customers.users.firstName,
      lastName: customers.users.lastName,
      businessName: customers.users.businessName,
      phone: customers.users.phone,
      email: customers.users.email,
    })
    .from(customers.userSourceLinks)
    .innerJoin(
      customers.users,
      eq(customers.users.id, customers.userSourceLinks.userId),
    )
    .where(
      and(
        eq(customers.userSourceLinks.source, command.source),
        eq(customers.userSourceLinks.externalUserId, command.externalUserId),
      ),
    )
    .limit(1);

  if (existing !== undefined && existing.businessId !== command.businessId)
    return {
      kind: 'failure',
      failure: {
        kind: 'conflict',
        code: 'canonical_source_user_business_conflict',
      },
    };
  if (existing !== undefined)
    return {
      kind: 'success',
      value: {
        customer: projectCustomerReferenceV1(mapStoredCustomer(existing)),
        created: false,
      },
    };

  await lockCustomerPersistenceKey(
    transaction,
    `users:command:${command.idempotencyKey}`,
  );
  const commandHash = resolveExactSourceCustomerCommandHash(command);
  const receipt = await loadCustomerCommandReceipt(
    transaction,
    customers,
    command.idempotencyKey,
  );
  if (receipt !== null) {
    if (receipt.commandHash !== commandHash)
      return {
        kind: 'failure',
        failure: { kind: 'conflict', code: 'user_idempotency_conflict' },
      };

    return throwSourceCustomerInvariant(
      'canonical_source_user_link_missing',
      'Canonical User receipt exists without its source identity.',
    );
  }

  const created = await insertStoredCustomer(transaction, customers, {
    businessId: command.businessId,
    profile: command.profile,
    authorityFields: customerProfileFields,
    now: command.now,
  });

  const receiptValue: CustomerCommandResult = {
    userId: created.id,
    version: created.version,
    replayed: false,
  };

  await saveCustomerCommandReceipt(transaction, customers, {
    businessId: command.businessId,
    idempotencyKey: command.idempotencyKey,
    commandHash,
    context: command.context,
    value: receiptValue,
    now: command.now,
  });

  const [link] = await transaction
    .insert(customers.userSourceLinks)
    .values({
      source: command.source,
      externalUserId: command.externalUserId,
      userId: created.id,
      createdAt: command.now,
      updatedAt: command.now,
    })
    .returning({ id: customers.userSourceLinks.id });
  if (link === undefined)
    return throwSourceCustomerInvariant(
      'canonical_source_user_link_insert_result_missing',
      'Canonical User source link insert returned no row.',
    );

  await transaction.insert(customers.userSourceSnapshots).values({
    sourceLinkId: link.id,
    sourceRevisionAt: command.revision.at,
    sourceRevisionHash: command.revision.hash,
    adapterVersion: command.revision.adapterVersion,
    normalizedPayload: command.revision.normalizedPayload,
    observedAt: command.revision.observedAt,
    createdAt: command.now,
    updatedAt: command.now,
  });
  await signalPossibleDuplicateContacts(transaction, customers, {
    businessId: command.businessId,
    userId: created.id,
    profile: command.profile,
    now: command.now,
  });

  return {
    kind: 'success',
    value: {
      customer: projectCustomerReferenceV1(created),
      created: true,
    },
  };
};

export const makeResolveExactSourceCustomerPostgresRepository = (
  database: PostgresDatabase,
  customers: ResolveExactSourceCustomerSchema,
): ResolveExactSourceCustomerRepository => ({
  transaction: (work) =>
    database.transaction((transaction) =>
      work((command) =>
        resolveExactSourceCustomerInTransaction(
          transaction,
          customers,
          command,
        ),
      ),
    ),
});
