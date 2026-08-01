import {
  and,
  eq,
  ne,
  sql,
  users as schema,
  type DatabaseExecutor,
} from '@pressly/db';
import type { CommandContext } from '@pressly/kernel';
import type { StoredUserCommandReceipt } from '../user-transaction.port.ts';
import type {
  UserCommandResult,
  UserFieldName,
  UserProfile,
  UserRecord,
} from '../users.port.ts';

export const lockUserKey = async (
  db: DatabaseExecutor,
  key: string,
): Promise<void> => {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  );
};

export const commandContextColumns = (context: CommandContext) => ({
  origin: context.origin,
  actorKind: context.principal.kind,
  actorId: context.principal.id,
});

export const parseUserCommandReceipt = (row: {
  commandHash: string;
  result: unknown;
}): StoredUserCommandReceipt => {
  const stored = row.result;
  if (
    stored === null ||
    typeof stored !== 'object' ||
    !('userId' in stored) ||
    !('version' in stored) ||
    typeof stored.userId !== 'string' ||
    typeof stored.version !== 'number'
  )
    throw new Error('Stored user command result is invalid.');
  return {
    commandHash: row.commandHash,
    result: { userId: stored.userId, version: stored.version, replayed: false },
  };
};

export const userFromRow = (row: {
  id: string;
  businessId: string;
  version: number;
  active: boolean;
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  phone: string | null;
  email: string | null;
}): UserRecord => ({
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

export const signalDuplicateUserContacts = async (
  db: DatabaseExecutor,
  input: {
    businessId: string;
    userId: string;
    profile: UserProfile;
    now: Date;
  },
): Promise<void> => {
  const candidates = new Map<string, Set<string>>();
  const record = (candidateId: string, reason: string) => {
    const reasons = candidates.get(candidateId) ?? new Set<string>();
    reasons.add(reason);
    candidates.set(candidateId, reasons);
  };

  if (input.profile.phone !== null) {
    const matches = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.businessId, input.businessId),
          eq(schema.users.phone, input.profile.phone),
          ne(schema.users.id, input.userId),
        ),
      );
    for (const match of matches) record(match.id, 'same_phone');
  }
  if (input.profile.email !== null) {
    const matches = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.businessId, input.businessId),
          eq(schema.users.email, input.profile.email),
          ne(schema.users.id, input.userId),
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
    await db
      .insert(schema.userDuplicateCandidates)
      .values(rows)
      .onConflictDoNothing();
};

export const loadUserCommandReceipt = async (
  db: DatabaseExecutor,
  idempotencyKey: string,
): Promise<StoredUserCommandReceipt | null> => {
  const [row] = await db
    .select({
      commandHash: schema.userCommandReceipts.commandHash,
      result: schema.userCommandReceipts.result,
    })
    .from(schema.userCommandReceipts)
    .where(eq(schema.userCommandReceipts.idempotencyKey, idempotencyKey))
    .limit(1);
  return row === undefined ? null : parseUserCommandReceipt(row);
};

export const saveUserCommandReceipt = async (
  db: DatabaseExecutor,
  input: {
    businessId: string;
    idempotencyKey: string;
    commandHash: string;
    context: CommandContext;
    value: UserCommandResult;
    now: Date;
  },
): Promise<void> => {
  await db.insert(schema.userCommandReceipts).values({
    businessId: input.businessId,
    idempotencyKey: input.idempotencyKey,
    commandHash: input.commandHash,
    ...commandContextColumns(input.context),
    userId: input.value.userId,
    result: input.value,
    createdAt: input.now,
  });
};

export const loadStoredUser = async (
  db: DatabaseExecutor,
  businessId: string,
  userId: string,
): Promise<UserRecord | null> => {
  const [row] = await db
    .select()
    .from(schema.users)
    .where(
      and(eq(schema.users.businessId, businessId), eq(schema.users.id, userId)),
    )
    .limit(1);
  return row === undefined ? null : userFromRow(row);
};

export const insertStoredUser = async (
  db: DatabaseExecutor,
  input: {
    businessId: string;
    profile: UserProfile;
    authorityFields: readonly UserFieldName[];
    now: Date;
  },
): Promise<UserRecord> => {
  const [created] = await db
    .insert(schema.users)
    .values({
      businessId: input.businessId,
      ...input.profile,
      version: 1,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning();
  if (created === undefined) throw new Error('User insert returned no row.');
  await db.insert(schema.userFieldAuthorities).values(
    input.authorityFields.map((fieldName) => ({
      userId: created.id,
      fieldName,
      authority: 'pressly',
      source: null,
      updatedAt: input.now,
    })),
  );
  return userFromRow(created);
};

export const updateStoredUser = async (
  db: DatabaseExecutor,
  input: {
    businessId: string;
    userId: string;
    changes: Partial<UserProfile> & Readonly<{ active?: boolean }>;
    authorityFields: readonly UserFieldName[];
    nextVersion: number;
    now: Date;
  },
): Promise<void> => {
  await db
    .update(schema.users)
    .set({
      ...input.changes,
      version: input.nextVersion,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(schema.users.businessId, input.businessId),
        eq(schema.users.id, input.userId),
      ),
    );
  for (const fieldName of input.authorityFields)
    await db
      .insert(schema.userFieldAuthorities)
      .values({
        userId: input.userId,
        fieldName,
        authority: 'pressly',
        source: null,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: [
          schema.userFieldAuthorities.userId,
          schema.userFieldAuthorities.fieldName,
        ],
        set: { authority: 'pressly', source: null, updatedAt: input.now },
      });
};
