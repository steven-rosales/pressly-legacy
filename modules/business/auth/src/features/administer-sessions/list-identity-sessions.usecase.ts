import type { SessionInventoryResult } from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import { result, type Result } from '@pressly/kernel';
import { utcIsoFromDate } from '@pressly/time';
import type { AdministerSessionsStore } from './administer-sessions.port.ts';

export type ListIdentitySessions = (
  identityId: string,
) => Promise<Result<SessionInventoryResult, AppError>>;

export const makeListIdentitySessions =
  (store: AdministerSessionsStore): ListIdentitySessions =>
  async (identityId) => {
    const found = await store.listIdentitySessions(identityId);
    if (result.isErr(found)) return found;

    return result.ok({
      sessions: found.value.map((session) => ({
        id: session.id,
        issuedAt: utcIsoFromDate(session.issuedAt),
        lastUsedAt: utcIsoFromDate(session.lastUsedAt),
        expiresAt: utcIsoFromDate(session.expiresAt),
        revokedAt:
          session.revokedAt === null ? null : utcIsoFromDate(session.revokedAt),
      })),
    });
  };
