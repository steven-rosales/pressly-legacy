import { type AppError } from '@pressly/errors';
import { result, type Result } from '@pressly/kernel';

import type { RevokeSessionStore } from '../../src/revoke-session/revoke-session.port.ts';
import {
  makeDefaultIdentity,
  makeDefaultSession,
} from '../support/builders.ts';

type RevokedSession = Readonly<{
  sessionId?: string;
  identityId?: string;
}>;

type RevokeSessionAuditEventInput = Parameters<
  RevokeSessionStore['recordAuditEvent']
>[0];

export type FakeRevokeSessionStoreOptions = Readonly<{
  revoked?: RevokedSession;
  revokeByTokenHashResult?: Result<RevokedSession, AppError>;
  recordAuditEventResult?: Result<void, AppError>;
}>;

export const makeFakeRevokeSessionStore = (
  options: FakeRevokeSessionStoreOptions = {},
) => {
  const revoked =
    options.revoked ??
    ({
      sessionId: makeDefaultSession().id,
      identityId: makeDefaultIdentity().id,
    } satisfies RevokedSession);

  const calls = {
    revokeByTokenHash: [] as Array<{ tokenHash: string; revokedAt: Date }>,
    recordAuditEvent: [] as RevokeSessionAuditEventInput[],
  };

  const store: RevokeSessionStore = {
    async revokeByTokenHash(tokenHash, revokedAt) {
      calls.revokeByTokenHash.push({ tokenHash, revokedAt });
      return options.revokeByTokenHashResult ?? result.ok(revoked);
    },
    async recordAuditEvent(input) {
      calls.recordAuditEvent.push(input);
      return options.recordAuditEventResult ?? result.ok(undefined);
    },
  };

  return { store, calls };
};
