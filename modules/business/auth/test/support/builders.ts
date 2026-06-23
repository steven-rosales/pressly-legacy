import type { IdentityKind } from '@pressly/auth/authentication';
import { globalScope } from '@pressly/auth/authorization';
import type {
  CreatedSession,
  LoginIdentityRecord,
  LoginPasswordCredentialRecord,
} from '../../src/features/login/login.port.ts';
import type {
  LoginCommand,
  LoginOptions,
} from '../../src/features/login/login.usecase.ts';
import type { StoredSessionPrincipalRecord } from '../../src/features/load-session/load-session.port.ts';

export const now = new Date('2026-05-29T12:00:00.000Z');

export const makeLoginCommand = (
  overrides: Partial<LoginCommand> = {},
): LoginCommand => ({
  email: ' Admin@Pressly.COM ',
  password: 'correct-password',
  ...overrides,
});

export const makeDefaultOptions = (
  overrides: Partial<LoginOptions> = {},
): LoginOptions => ({
  sessionTtlMinutes: 30,
  loginWindowMinutes: 15,
  loginMaxFailures: 5,
  ...overrides,
});

export const makeDefaultIdentity = (
  overrides: Partial<LoginIdentityRecord> = {},
): LoginIdentityRecord => ({
  id: '00000000-0000-4000-8000-000000000001',
  kind: 'human',
  displayName: 'Admin User',
  email: 'admin@pressly.com',
  isActive: true,
  roles: ['admin'],
});

export const makeDefaultCredential = (
  overrides: Partial<LoginPasswordCredentialRecord> = {},
): LoginPasswordCredentialRecord => ({
  identityId: makeDefaultIdentity().id,
  passwordHash: 'stored-password-hash',
  ...overrides,
});

export const makeDefaultSession = (
  overrides: Partial<CreatedSession> = {},
): CreatedSession => ({
  id: '00000000-0000-4000-8000-000000000002',
  issuedAt: now,
  expiresAt: new Date('2026-05-29T12:30:00.000Z'),
  ...overrides,
});

export const makeDefaultStoredSessionPrincipal = (
  overrides: Partial<StoredSessionPrincipalRecord> = {},
): StoredSessionPrincipalRecord => ({
  sessionId: makeDefaultSession().id,
  identityId: makeDefaultIdentity().id,
  kind: 'human',
  displayName: 'Admin User',
  email: 'admin@pressly.com',
  isActive: true,
  assignments: [{ role: 'admin', scope: globalScope() }],
  issuedAt: new Date('2026-05-29T11:30:00.000Z'),
  expiresAt: new Date('2026-05-29T12:30:00.000Z'),
  revokedAt: null,
  ...overrides,
});
