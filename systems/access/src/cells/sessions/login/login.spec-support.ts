import type { AppError } from '@pressly/errors/app-error';

import type {
  CreateMfaChallengeInput,
  CreateSessionInput,
  LoginAttemptInput,
  LoginAuditEventInput,
  LoginIdentityRecord,
  LoginPasswordCredentialRecord,
  LoginStore,
} from './login.port.ts';
import {
  makeDefaultCredential,
  makeDefaultIdentity,
  makeDefaultSession,
} from '../../../testing/builders.spec-support.ts';

export type FakeStoreOptions = Readonly<{
  failedAttempts?: number;
  identity?: LoginIdentityRecord | undefined;
  credential?: LoginPasswordCredentialRecord | undefined;
  countRecentFailedAttemptsError?: AppError;
  findIdentityByEmailError?: AppError;
  findPasswordCredentialError?: AppError;
  createSessionError?: AppError;
  createMfaChallengeError?: AppError;
  recordLoginAttemptError?: AppError;
  recordAuditEventError?: AppError;
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
      if (options.countRecentFailedAttemptsError !== undefined)
        throw options.countRecentFailedAttemptsError;
      return options.failedAttempts ?? 0;
    },
    async findIdentityByEmail(emailNormalized) {
      calls.findIdentityByEmail.push(emailNormalized);
      if (options.findIdentityByEmailError !== undefined)
        throw options.findIdentityByEmailError;
      return identity;
    },
    async findPasswordCredential(identityId) {
      calls.findPasswordCredential.push(identityId);
      if (options.findPasswordCredentialError !== undefined)
        throw options.findPasswordCredentialError;
      return credential;
    },
    async createSession(input) {
      calls.createSession.push(input);
      if (options.createSessionError !== undefined)
        throw options.createSessionError;
      return makeDefaultSession();
    },
    async createMfaChallenge(input) {
      calls.createMfaChallenge.push(input);
      if (options.createMfaChallengeError !== undefined)
        throw options.createMfaChallengeError;
    },
    async recordLoginAttempt(input) {
      calls.recordLoginAttempt.push(input);
      if (options.recordLoginAttemptError !== undefined)
        throw options.recordLoginAttemptError;
    },
    async recordAuditEvent(input) {
      calls.recordAuditEvent.push(input);
      if (options.recordAuditEventError !== undefined)
        throw options.recordAuditEventError;
    },
  };

  return { store, calls };
};
