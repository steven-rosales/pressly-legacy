import type { SessionInventory } from './list-identity-sessions.model.ts';
import type { ListIdentitySessionsStore } from './list-identity-sessions.port.ts';

export type ListIdentitySessions = (
  identityId: string,
) => Promise<SessionInventory>;

export const makeListIdentitySessions =
  (store: ListIdentitySessionsStore): ListIdentitySessions =>
  async (identityId) => {
    const found = await store.listIdentitySessions(identityId);
    return {
      sessions: found.map((session) => ({
        id: session.id,
        issuedAt: session.issuedAt,
        lastUsedAt: session.lastUsedAt,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
      })),
    };
  };
