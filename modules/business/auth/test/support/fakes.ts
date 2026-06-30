import { result, type Result } from '@pressly/kernel';
import { type AppError } from '@pressly/errors';
import type {
  CreatedSession,
  CreateSessionInput,
  CreateMfaChallengeInput,
  LoginAttemptInput,
  LoginIdentityRecord,
  LoginPasswordCredentialRecord,
} from '../../src/features/login/login.port.ts';
import type { LoginAuditEventInput } from '../../src/features/login/login.port.ts';
import type { LoginStore } from '../../src/features/login/login.port.ts';
import type {
  LoadSessionStore,
  StoredSessionPrincipalRecord,
} from '../../src/features/load-session/load-session.port.ts';
import type { RevokeSessionStore } from '../../src/features/revoke-session/revoke-session.port.ts';
import {
  makeDefaultCredential,
  makeDefaultIdentity,
  makeDefaultSession,
  makeDefaultStoredSessionPrincipal,
} from './builders.ts';

export type FakeStoreOptions = Readonly<{
  failedAttempts?: number;
  identity?: LoginIdentityRecord | undefined;
  credential?: LoginPasswordCredentialRecord | undefined;
  countRecentFailedAttemptsResult?: Result<number, AppError>;
  findIdentityByEmailResult?: Result<LoginIdentityRecord | undefined, AppError>;
  findPasswordCredentialResult?: Result<
    LoginPasswordCredentialRecord | undefined,
    AppError
  >;
  createSessionResult?: Result<CreatedSession, AppError>;
  createMfaChallengeResult?: Result<void, AppError>;
  recordLoginAttemptResult?: Result<void, AppError>;
  recordAuditEventResult?: Result<void, AppError>;
}>;

export const makeFakeLoginStore = (options: FakeStoreOptions = {}) => {
  const identity =
    'identity' in options ? options.identity : makeDefaultIdentity();
  const credential =
    'credential' in options ? options.credential : makeDefaultCredential();

  const calls = {
    countRecentFailedAttempts: [] as Array<{
      emailNormalized: string;
      since: Date;
    }>,
    findIdentityByEmail: [] as string[],
    findPasswordCredential: [] as string[],
    createSession: [] as CreateSessionInput[],
    createMfaChallenge: [] as CreateMfaChallengeInput[],
    recordLoginAttempt: [] as LoginAttemptInput[],
    recordAuditEvent: [] as LoginAuditEventInput[],
  };

  const store: LoginStore = {
    async countRecentFailedAttempts(input) {
      calls.countRecentFailedAttempts.push(input);
      return (
        options.countRecentFailedAttemptsResult ??
        result.ok(options.failedAttempts ?? 0)
      );
    },
    async findIdentityByEmail(emailNormalized) {
      calls.findIdentityByEmail.push(emailNormalized);
      return options.findIdentityByEmailResult ?? result.ok(identity);
    },
    async findPasswordCredential(identityId) {
      calls.findPasswordCredential.push(identityId);
      return options.findPasswordCredentialResult ?? result.ok(credential);
    },
    async createSession(input) {
      calls.createSession.push(input);
      return options.createSessionResult ?? result.ok(makeDefaultSession());
    },
    async createMfaChallenge(input) {
      calls.createMfaChallenge.push(input);
      return options.createMfaChallengeResult ?? result.ok(undefined);
    },
    async recordLoginAttempt(input) {
      calls.recordLoginAttempt.push(input);
      return options.recordLoginAttemptResult ?? result.ok(undefined);
    },
    async recordAuditEvent(input) {
      calls.recordAuditEvent.push(input);
      return options.recordAuditEventResult ?? result.ok(undefined);
    },
  };

  return { store, calls };
};

export type FakeLoadSessionStoreOptions = Readonly<{
  principal?: StoredSessionPrincipalRecord | undefined;
  findByTokenHashResult?: Result<
    StoredSessionPrincipalRecord | undefined,
    AppError
  >;
  touchSessionResult?: Result<void, AppError>;
}>;

export const makeFakeLoadSessionStore = (
  options: FakeLoadSessionStoreOptions = {},
) => {
  const principal =
    'principal' in options
      ? options.principal
      : makeDefaultStoredSessionPrincipal();

  const calls = {
    findByTokenHash: [] as string[],
    touchSession: [] as Array<{ sessionId: string; now: Date }>,
  };

  const store: LoadSessionStore = {
    async findByTokenHash(tokenHash) {
      calls.findByTokenHash.push(tokenHash);
      return options.findByTokenHashResult ?? result.ok(principal);
    },
    async touchSession(sessionId, now) {
      calls.touchSession.push({ sessionId, now });
      return options.touchSessionResult ?? result.ok(undefined);
    },
  };

  return { store, calls };
};

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
