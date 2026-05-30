import { ok, type AppError, type Result } from '@pressly/errors';
import type {
  AuthAuditEventInput,
  CreatedSession,
  CreateSessionInput,
  LoginAttemptInput,
  LoginIdentityRecord,
  LoginPasswordCredentialRecord,
  LoginStore,
} from '../../src/features/login/login.port.ts';
import {
  makeDefaultCredential,
  makeDefaultIdentity,
  makeDefaultSession,
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
    recordLoginAttempt: [] as LoginAttemptInput[],
    recordAuditEvent: [] as AuthAuditEventInput[],
  };

  const store: LoginStore = {
    async countRecentFailedAttempts(input) {
      calls.countRecentFailedAttempts.push(input);
      return (
        options.countRecentFailedAttemptsResult ??
        ok(options.failedAttempts ?? 0)
      );
    },
    async findIdentityByEmail(emailNormalized) {
      calls.findIdentityByEmail.push(emailNormalized);
      return options.findIdentityByEmailResult ?? ok(identity);
    },
    async findPasswordCredential(identityId) {
      calls.findPasswordCredential.push(identityId);
      return options.findPasswordCredentialResult ?? ok(credential);
    },
    async createSession(input) {
      calls.createSession.push(input);
      return options.createSessionResult ?? ok(makeDefaultSession());
    },
    async recordLoginAttempt(input) {
      calls.recordLoginAttempt.push(input);
      return options.recordLoginAttemptResult ?? ok(undefined);
    },
    async recordAuditEvent(input) {
      calls.recordAuditEvent.push(input);
      return options.recordAuditEventResult ?? ok(undefined);
    },
  };

  return { store, calls };
};
