import { auth, eq, type Database } from '@pressly/db';
import type { LoadSessionStore } from '../../../features/load-session/load-session.port.ts';
import { toDatabaseResult } from '../../common/persistence/database-result.ts';
import { mapStoredRoles } from '../../common/persistence/roles.ts';

export const makeLoadSessionStore = (db: Database): LoadSessionStore => ({
  findByTokenHash: async (tokenHash) =>
    toDatabaseResult(async () => {
      const [row] = await db
        .select({
          session: auth.authSessions,
          identity: auth.authIdentities,
        })
        .from(auth.authSessions)
        .innerJoin(
          auth.authIdentities,
          eq(auth.authSessions.identityId, auth.authIdentities.id),
        )
        .where(eq(auth.authSessions.tokenHash, tokenHash))
        .limit(1);

      if (row === undefined) return undefined;

      const roles = await db
        .select()
        .from(auth.authIdentityRoles)
        .where(eq(auth.authIdentityRoles.identityId, row.identity.id));

      return {
        sessionId: row.session.id,
        identityId: row.identity.id,
        kind: row.identity.kind === 'service' ? 'service' : 'human',
        displayName: row.identity.displayName,
        ...(row.identity.email === null ? {} : { email: row.identity.email }),
        isActive: row.identity.isActive,
        roles: mapStoredRoles(roles),
        issuedAt: row.session.issuedAt,
        expiresAt: row.session.expiresAt,
        revokedAt: row.session.revokedAt,
      };
    }),

  touchSession: async (sessionId, now) =>
    toDatabaseResult(async () => {
      await db
        .update(auth.authSessions)
        .set({ lastUsedAt: now })
        .where(eq(auth.authSessions.id, sessionId));
    }),
});
