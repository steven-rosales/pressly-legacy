import { type DatabaseExecutor } from '@pressly/db/client';
import { and, eq } from '@pressly/db/query';
import * as schema from '@pressly/db/schema/users';
import { invariantViolationError } from '@pressly/errors/factories';
import { result } from '@pressly/kernel';
import {
  loadUserCommandReceipt,
  lockUserPersistenceKey,
  saveUserCommandReceipt,
} from '../../../foundations/adapters/postgres/user-command-receipt.adapter.ts';
import { signalDuplicateUserContacts } from '../../../foundations/adapters/postgres/user-duplicate-contact.adapter.ts';
import { insertStoredUser } from '../../../foundations/adapters/postgres/user-write.adapter.ts';
import { hashUserCommand } from '../../../foundations/language/command-identity/user-command-identity.policy.ts';
import { userProfileFields } from '../../../foundations/language/users/user-profile.policy.ts';
import { resolveCanonicalSourceUserFailure } from './resolve-canonical-source-user.failure.ts';
import type { ResolveCanonicalSourceUserRepository } from './resolve-canonical-source-user.port.ts';

const throwCanonicalSourceUserInvariant = (
  code: string,
  message: string,
): never => {
  throw invariantViolationError({
    code,
    message,
    safeMessage: 'Stored user data is inconsistent.',
  });
};

export const makePostgresResolveCanonicalSourceUserRepository = (
  db: DatabaseExecutor,
): ResolveCanonicalSourceUserRepository => ({
  resolveOrCreate: async (command) => {
    await lockUserPersistenceKey(
      db,
      `users:source:${command.source}:${command.externalUserId}`,
    );

    const [existing] = await db
      .select({
        userId: schema.userSourceLinks.userId,
        businessId: schema.users.businessId,
      })
      .from(schema.userSourceLinks)
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.userSourceLinks.userId),
      )
      .where(
        and(
          eq(schema.userSourceLinks.source, command.source),
          eq(schema.userSourceLinks.externalUserId, command.externalUserId),
        ),
      )
      .limit(1);

    if (existing !== undefined && existing.businessId !== command.businessId)
      return result.err(resolveCanonicalSourceUserFailure.businessConflict());
    if (existing !== undefined)
      return result.ok({ userId: existing.userId, created: false });

    await lockUserPersistenceKey(db, `users:command:${command.idempotencyKey}`);

    const createCommand = {
      businessId: command.businessId,
      idempotencyKey: command.idempotencyKey,
      context: command.context,
      profile: command.profile,
    };
    const commandHash = hashUserCommand(createCommand);
    const receipt = await loadUserCommandReceipt(db, command.idempotencyKey);

    if (receipt !== null) {
      if (receipt.commandHash !== commandHash)
        return result.err(
          resolveCanonicalSourceUserFailure.idempotencyConflict(),
        );
      return throwCanonicalSourceUserInvariant(
        'canonical_source_user_link_missing',
        'Canonical User receipt exists without its source identity.',
      );
    }

    const created = await insertStoredUser(db, {
      businessId: command.businessId,
      profile: command.profile,
      authorityFields: userProfileFields,
      now: command.now,
    });

    await saveUserCommandReceipt(db, {
      businessId: command.businessId,
      idempotencyKey: command.idempotencyKey,
      commandHash,
      context: command.context,
      value: { userId: created.id, version: created.version, replayed: false },
      now: command.now,
    });

    const [link] = await db
      .insert(schema.userSourceLinks)
      .values({
        source: command.source,
        externalUserId: command.externalUserId,
        userId: created.id,
        createdAt: command.now,
        updatedAt: command.now,
      })
      .returning({ id: schema.userSourceLinks.id });

    if (link === undefined)
      return throwCanonicalSourceUserInvariant(
        'canonical_source_user_link_insert_result_missing',
        'Canonical User source link insert returned no row.',
      );

    await db.insert(schema.userSourceSnapshots).values({
      sourceLinkId: link.id,
      sourceRevisionAt: command.revision.at,
      sourceRevisionHash: command.revision.hash,
      adapterVersion: command.revision.adapterVersion,
      normalizedPayload: command.revision.normalizedPayload,
      observedAt: command.revision.observedAt,
      createdAt: command.now,
      updatedAt: command.now,
    });

    await signalDuplicateUserContacts(db, {
      businessId: command.businessId,
      userId: created.id,
      profile: command.profile,
      now: command.now,
    });

    return result.ok({ userId: created.id, created: true });
  },
});
