import type { AppError } from '@pressly/errors/app-error';

import type { RevokeSessionStore } from '../../../../src/features/sessions/revoke-session/revoke-session.port.ts';
import {
  makeDefaultIdentity,
  makeDefaultSession,
} from '../../../support/builders.ts';

type RevokedSession = Readonly<{
  sessionId?: string;
  identityId?: string;
}>;

type RevokeSessionAuditEventInput = Parameters<
  RevokeSessionStore['recordAuditEvent']
>[0];

export type FakeRevokeSessionStoreOptions = Readonly<{
  revoked?: RevokedSession;
  revokeByTokenHashError?: AppError;
  recordAuditEventError?: AppError;
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
      if (options.revokeByTokenHashError !== undefined)
        throw options.revokeByTokenHashError;
      return revoked;
    },
    async recordAuditEvent(input) {
      calls.recordAuditEvent.push(input);
      if (options.recordAuditEventError !== undefined)
        throw options.recordAuditEventError;
    },
  };

  return { store, calls };
};
