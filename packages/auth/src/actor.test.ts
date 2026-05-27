import { describe, expect, it } from 'vitest';

import { actorFromPrincipal, makeActor } from './actor.ts';
import type { Principal } from './principal.ts';
import { principalLabel } from './principal.ts';

const principal = (input: Partial<Principal> = {}): Principal => ({
  identityId: input.identityId ?? 'identity_1',
  kind: input.kind ?? 'human',
  displayName: input.displayName ?? 'Steven',
  roles: input.roles ?? ['admin'],
  ...(input.email === undefined ? {} : { email: input.email }),
  ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
  ...(input.sessionIssuedAt === undefined
    ? {}
    : { sessionIssuedAt: input.sessionIssuedAt }),
  ...(input.sessionExpiresAt === undefined
    ? {}
    : { sessionExpiresAt: input.sessionExpiresAt }),
});

describe('makeActor', () => {
  it('derives permissions from the selected role', () => {
    expect(
      makeActor({
        id: 'identity_1',
        kind: 'human',
        displayName: 'Steven',
        role: 'operator',
      }),
    ).toEqual({
      id: 'identity_1',
      kind: 'human',
      displayName: 'Steven',
      role: 'operator',
      permissions: ['pricing:read'],
    });
  });
});

describe('actorFromPrincipal', () => {
  it('keeps human principals as human actors', () => {
    expect(
      actorFromPrincipal({
        principal: principal({ kind: 'human' }),
        role: 'admin',
      }),
    ).toMatchObject({
      id: 'identity_1',
      kind: 'human',
      displayName: 'Steven',
      role: 'admin',
    });
  });

  it('maps service principals to service actors', () => {
    expect(
      actorFromPrincipal({
        principal: principal({ kind: 'service' }),
        role: 'ci',
      }),
    ).toMatchObject({
      id: 'identity_1',
      kind: 'service',
      role: 'ci',
      permissions: [
        'pricing:read',
        'pricing:plan',
        'pricing:publish',
        'pricing:rollback',
      ],
    });
  });
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
