import {
  and,
  eq,
  users as schema,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import { userProfileFields } from '../user-profile.policy.ts';
import {
  lockUserKey,
  signalDuplicateUserContacts,
  userFromRow,
} from '../persistence/postgres-user.shared.ts';
import type {
  ObserveUserSourceOperations,
  ObserveUserSourceRepository,
} from './observe-user-source.port.ts';

const makeOperations = (tx: DatabaseExecutor): ObserveUserSourceOperations => ({
  lockSource: async (identity) =>
    lockUserKey(
      tx,
      `users:source:${identity.source}:${identity.externalUserId}`,
    ),

  loadSource: async (identity) => {
    const [link] = await tx
      .select()
      .from(schema.userSourceLinks)
      .where(
        and(
          eq(schema.userSourceLinks.source, identity.source),
          eq(schema.userSourceLinks.externalUserId, identity.externalUserId),
        ),
      )
      .limit(1);
    if (link === undefined) return null;

    const [userRow] = await tx
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, link.userId))
      .limit(1);
    if (userRow === undefined) throw new Error('User source link is orphaned.');
    const [snapshot] = await tx
      .select()
      .from(schema.userSourceSnapshots)
      .where(eq(schema.userSourceSnapshots.sourceLinkId, link.id))
      .limit(1);
    const authorityRows = await tx
      .select()
      .from(schema.userFieldAuthorities)
      .where(eq(schema.userFieldAuthorities.userId, userRow.id));
    const authorities = new Map(
      authorityRows.map((authority) => {
        if (
          authority.authority !== 'pressly' &&
          authority.authority !== 'source'
        )
          throw new Error('Stored user field authority is invalid.');
        return [
          authority.fieldName as (typeof userProfileFields)[number],
          {
            authority: authority.authority,
            source: authority.source,
          },
        ] as const;
      }),
    );
    return {
      sourceLinkId: link.id,
      user: userFromRow(userRow),
      revision:
        snapshot === undefined
          ? null
          : {
              at: snapshot.sourceRevisionAt,
              hash: snapshot.sourceRevisionHash,
            },
      authorities,
    };
  },

  createSourceUser: async (observation) => {
    const [created] = await tx
      .insert(schema.users)
      .values({ ...observation.profile, version: 1 })
      .returning();
    if (created === undefined) throw new Error('User insert returned no row.');
    const [link] = await tx
      .insert(schema.userSourceLinks)
      .values({
        source: observation.source,
        externalUserId: observation.externalUserId,
        userId: created.id,
      })
      .returning({ id: schema.userSourceLinks.id });
    if (link === undefined)
      throw new Error('User source link insert returned no row.');
    await tx.insert(schema.userSourceSnapshots).values({
      sourceLinkId: link.id,
      sourceRevisionAt: observation.revision.at,
      sourceRevisionHash: observation.revision.hash,
      adapterVersion: observation.revision.adapterVersion,
      normalizedPayload: observation.revision.normalizedPayload,
      observedAt: observation.revision.observedAt,
    });
    await tx.insert(schema.userFieldAuthorities).values(
      userProfileFields.map((fieldName) => ({
        userId: created.id,
        fieldName,
        authority: 'source',
        source: observation.source,
      })),
    );
    await signalDuplicateUserContacts(tx, {
      userId: created.id,
      profile: observation.profile,
      now: observation.revision.observedAt,
    });
    return userFromRow(created);
  },

  applySourceUser: async (input) => {
    if (input.missingAuthorities.length > 0)
      await tx.insert(schema.userFieldAuthorities).values(
        input.missingAuthorities.map((fieldName) => ({
          userId: input.current.user.id,
          fieldName,
          authority: 'source',
          source: input.observation.source,
        })),
      );
    await tx
      .update(schema.users)
      .set({
        ...input.changes,
        version: input.nextVersion,
        updatedAt: input.observation.revision.observedAt,
      })
      .where(eq(schema.users.id, input.current.user.id));
    await tx
      .insert(schema.userSourceSnapshots)
      .values({
        sourceLinkId: input.current.sourceLinkId,
        sourceRevisionAt: input.observation.revision.at,
        sourceRevisionHash: input.observation.revision.hash,
        adapterVersion: input.observation.revision.adapterVersion,
        normalizedPayload: input.observation.revision.normalizedPayload,
        observedAt: input.observation.revision.observedAt,
        updatedAt: input.observation.revision.observedAt,
      })
      .onConflictDoUpdate({
        target: schema.userSourceSnapshots.sourceLinkId,
        set: {
          sourceRevisionAt: input.observation.revision.at,
          sourceRevisionHash: input.observation.revision.hash,
          adapterVersion: input.observation.revision.adapterVersion,
          normalizedPayload: input.observation.revision.normalizedPayload,
          observedAt: input.observation.revision.observedAt,
          updatedAt: input.observation.revision.observedAt,
        },
      });
    await signalDuplicateUserContacts(tx, {
      userId: input.current.user.id,
      profile: input.nextProfile,
      now: input.observation.revision.observedAt,
    });
  },
});

export const makePostgresObserveUserSourceRepository = (
  db: Database,
): ObserveUserSourceRepository => ({
  transaction: (work) => db.transaction((tx) => work(makeOperations(tx))),
});
