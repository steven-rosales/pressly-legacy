import type { IdentitySessionStore } from '../../../foundations/ports/identity-session-store/identity-session-store.port.ts';
import type { SessionInventory } from './list-identity-sessions.model.ts';

export type ListIdentitySessions = (
  identityId: string,
) => Promise<SessionInventory>;

export const makeListIdentitySessions =
  (store: IdentitySessionStore): ListIdentitySessions =>
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
