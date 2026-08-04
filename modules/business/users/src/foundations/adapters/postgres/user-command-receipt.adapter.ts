import { type DatabaseExecutor } from '@pressly/db/client';
import { eq, sql } from '@pressly/db/query';
import * as schema from '@pressly/db/schema/users';
import type { CommandContext } from '@pressly/kernel';
import type {
  StoredUserCommandReceipt,
  UserCommandResult,
} from '../../language/command-identity/user-command-result.model.ts';
import { mapStoredUserCommandReceipt } from './user.persistence.mapper.ts';

export const lockUserPersistenceKey = async (
  db: DatabaseExecutor,
  key: string,
): Promise<void> => {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  );
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

  return row === undefined ? null : mapStoredUserCommandReceipt(row);
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
    origin: input.context.origin,
    actorKind: input.context.principal.kind,
    actorId: input.context.principal.id,
    userId: input.value.userId,
    result: input.value,
    createdAt: input.now,
  });
};
