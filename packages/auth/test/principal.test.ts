import { describe, expect, it } from 'vitest';

import { principalLabel, type Principal } from '../src/authentication/index.ts';

const principal = (input: Partial<Principal> = {}): Principal => ({
  identityId: input.identityId ?? 'identity_1',
  kind: input.kind ?? 'human',
  displayName: input.displayName ?? 'Steven',
  ...(input.email === undefined ? {} : { email: input.email }),
  ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
  ...(input.sessionIssuedAt === undefined
    ? {}
    : { sessionIssuedAt: input.sessionIssuedAt }),
  ...(input.sessionExpiresAt === undefined
    ? {}
    : { sessionExpiresAt: input.sessionExpiresAt }),
});

describe('principalLabel', () => {
  it('prefers email when present', () => {
    expect(principalLabel(principal({ email: 'steven@example.com' }))).toBe(
      'steven@example.com',
    );
  });

  it('falls back to display name', () => {
    expect(principalLabel(principal())).toBe('Steven');
  });
});
