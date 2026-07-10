import { type AppError } from '@pressly/errors';
import { result, type Result } from '@pressly/kernel';

import type {
  CreatedSession,
  CreateMfaChallengeInput,
  CreateSessionInput,
  LoginAttemptInput,
  LoginAuditEventInput,
  LoginIdentityRecord,
  LoginPasswordCredentialRecord,
  LoginStore,
} from '../../src/login/login.port.ts';
import {
  makeDefaultCredential,
  makeDefaultIdentity,
  makeDefaultSession,
} from '../support/builders.ts';

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
