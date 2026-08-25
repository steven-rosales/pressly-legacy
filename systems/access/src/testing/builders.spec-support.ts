import { businessScope } from '../model/authorization/public.ts';
import type {
  CreatedSession,
  LoginIdentityRecord,
  LoginPasswordCredentialRecord,
} from '../cells/sessions/login/login.port.ts';
import type { LoginCommand } from '../cells/sessions/login/login.model.ts';
import type { LoginOptions } from '../cells/sessions/login/login.usecase.ts';
import type { StoredSessionPrincipalRecord } from '../cells/sessions/load-session/load-session.port.ts';

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
  mfaChallengeTtlMinutes: 5,
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
  roles: ['owner'],
  mfaEnabled: false,
  ...overrides,
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
  assignments: [
    {
      role: 'owner',
      scope: businessScope('00000000-0000-4000-8000-000000000010'),
      state: 'active',
      version: 1,
    },
  ],
  issuedAt: new Date('2026-05-29T11:30:00.000Z'),
  expiresAt: new Date('2026-05-29T12:30:00.000Z'),
  revokedAt: null,
  lastUsedAt: new Date('2026-05-29T11:55:00.000Z'),
  assuranceLevel: 'password',
  ...overrides,
});
