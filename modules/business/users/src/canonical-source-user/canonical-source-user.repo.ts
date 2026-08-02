import { and, eq, users as schema, type DatabaseExecutor } from '@pressly/db';
import {
  conflictError,
  invariantViolationError,
  type AppError,
} from '@pressly/errors';
import type { CommandContext } from '@pressly/kernel';
import {
  insertStoredUser,
  loadUserCommandReceipt,
  lockUserKey,
  saveUserCommandReceipt,
  signalDuplicateUserContacts,
} from '../persistence/postgres-user.shared.ts';
import { hashUserCommand } from '../command-execution/user-command-idempotency.policy.ts';
import { userProfileFields } from '../user-profile/user-profile.policy.ts';
import type { UserProfile } from '../user-profile/user-profile.model.ts';

export type CanonicalSourceUserAcceptanceInput = Readonly<{
  businessId: string;
  source: string;
  externalUserId: string;
  profile: UserProfile;
  revision: Readonly<{
    at: Date;
    hash: string;
    adapterVersion: string;
    observedAt: Date;
    normalizedPayload: unknown;
  }>;
  idempotencyKey: string;
  context: CommandContext;
  now: Date;
}>;

export type CanonicalSourceUserAcceptanceResult = Readonly<{
  userId: string;
  created: boolean;
}>;

export type CanonicalSourceUserAcceptanceAdapter = Readonly<{
  resolveOrCreate: (
    db: DatabaseExecutor,
    input: CanonicalSourceUserAcceptanceInput,
  ) => Promise<CanonicalSourceUserAcceptanceResult>;
}>;

const canonicalSourceUserInvariant = (
  code: string,
  message: string,
): AppError =>
  invariantViolationError({
    code: code.toLowerCase(),
    message,
    safeMessage: 'Stored user data is inconsistent.',
  });

const canonicalSourceUserConflict = (code: string, message: string): AppError =>
  conflictError({
    code: code.toLowerCase(),
    message,
    safeMessage: message,
  });

const resolveOrCreateCanonicalSourceUser = async (
  db: DatabaseExecutor,
  input: CanonicalSourceUserAcceptanceInput,
): Promise<CanonicalSourceUserAcceptanceResult> => {
  await lockUserKey(db, `users:source:${input.source}:${input.externalUserId}`);

  const [existing] = await db
    .select({
      userId: schema.userSourceLinks.userId,
      businessId: schema.users.businessId,
    })
    .from(schema.userSourceLinks)
    .innerJoin(schema.users, eq(schema.users.id, schema.userSourceLinks.userId))
    .where(
      and(
        eq(schema.userSourceLinks.source, input.source),
        eq(schema.userSourceLinks.externalUserId, input.externalUserId),
      ),
    )
    .limit(1);

  if (existing !== undefined && existing.businessId !== input.businessId)
    throw canonicalSourceUserConflict(
      'CANONICAL_SOURCE_USER_BUSINESS_CONFLICT',
      'The source user is already associated with another business.',
    );
  if (existing !== undefined)
    return { userId: existing.userId, created: false };

  await lockUserKey(db, `users:command:${input.idempotencyKey}`);

  const createCommand = {
    businessId: input.businessId,
    idempotencyKey: input.idempotencyKey,
    context: input.context,
    profile: input.profile,
  };
  const commandHash = hashUserCommand(createCommand);

  const receipt = await loadUserCommandReceipt(db, input.idempotencyKey);
  if (receipt !== null) {
    if (receipt.commandHash !== commandHash)
      throw canonicalSourceUserConflict(
        'USER_IDEMPOTENCY_CONFLICT',
        'The idempotency key belongs to another user command.',
      );
    throw canonicalSourceUserInvariant(
      'CANONICAL_SOURCE_USER_LINK_MISSING',
      'Canonical User receipt exists without its source identity.',
    );
  }

  const created = await insertStoredUser(db, {
    businessId: input.businessId,
    profile: input.profile,
    authorityFields: userProfileFields,
    now: input.now,
  });

  await saveUserCommandReceipt(db, {
    businessId: input.businessId,
    idempotencyKey: input.idempotencyKey,
    commandHash,
    context: input.context,
    value: { userId: created.id, version: created.version, replayed: false },
    now: input.now,
  });

  const [link] = await db
    .insert(schema.userSourceLinks)
    .values({
      source: input.source,
      externalUserId: input.externalUserId,
      userId: created.id,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning({ id: schema.userSourceLinks.id });

  if (link === undefined)
    throw canonicalSourceUserInvariant(
      'CANONICAL_SOURCE_USER_LINK_INSERT_RESULT_MISSING',
      'Canonical User source link insert returned no row.',
    );

  await db.insert(schema.userSourceSnapshots).values({
    sourceLinkId: link.id,
    sourceRevisionAt: input.revision.at,
    sourceRevisionHash: input.revision.hash,
    adapterVersion: input.revision.adapterVersion,
    normalizedPayload: input.revision.normalizedPayload,
    observedAt: input.revision.observedAt,
    createdAt: input.now,
    updatedAt: input.now,
  });

  await signalDuplicateUserContacts(db, {
    businessId: input.businessId,
    userId: created.id,
    profile: input.profile,
    now: input.now,
  });

  return { userId: created.id, created: true };
};

export const makePostgresCanonicalSourceUserAcceptanceAdapter =
  (): CanonicalSourceUserAcceptanceAdapter => ({
    resolveOrCreate: resolveOrCreateCanonicalSourceUser,
  });
