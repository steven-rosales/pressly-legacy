import type { Actor, IdentityKind } from '@pressly/auth';
import type {
  CreatedSession,
  LoginIdentityRecord,
  LoginPasswordCredentialRecord,
} from '../../src/features/login/login.port.ts';
import type {
  LoginOptions,
  LoginCommand,
} from '../../src/features/login/login.usecase.ts';

export const now = new Date('2026-05-29T12:00:00.000Z');

export const makeAdminActor = (
  id: string,
  kind: IdentityKind,
  displayName: string,
): Omit<Actor, 'permissions'> => ({
  id,
  kind,
  displayName,
  role: 'admin',
});

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
