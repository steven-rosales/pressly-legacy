import {
  identitySessionsParamsSchema,
  sessionInventoryResultSchema,
  type SessionInventoryResult,
} from '@pressly/contracts/auth';
import { utcIsoFromDate } from '@pressly/time';
import type { SessionInventory } from './list-identity-sessions.model.ts';

export const listIdentitySessionsContract = Object.freeze({
  params: identitySessionsParamsSchema,
  response: sessionInventoryResultSchema,
});

export const toSessionInventoryResult = (
  inventory: SessionInventory,
): SessionInventoryResult => ({
  sessions: inventory.sessions.map((session) => ({
    id: session.id,
    issuedAt: utcIsoFromDate(session.issuedAt),
    lastUsedAt: utcIsoFromDate(session.lastUsedAt),
    expiresAt: utcIsoFromDate(session.expiresAt),
    revokedAt:
      session.revokedAt === null ? null : utcIsoFromDate(session.revokedAt),
  })),
});
