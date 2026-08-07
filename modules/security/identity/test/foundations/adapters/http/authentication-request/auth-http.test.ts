import type { Principal } from '@pressly/auth/authentication';
import type { Response } from 'express';
import { describe, expect, it } from 'vitest';
import { readPrincipal } from '../../../../../src/foundations/adapters/http/authentication-request/auth-context.adapter.ts';
import { readBearerToken } from '../../../../../src/foundations/adapters/http/authentication-request/read-bearer.adapter.ts';

describe('readPrincipal', () => {
  it('reads the authenticated principal through the auth HTTP boundary', () => {
    const principal: Principal = {
      identityId: '11111111-1111-4111-8111-111111111111',
      kind: 'human',
      displayName: 'Admin User',
    };

    expect(
      readPrincipal({ locals: { auth: { principal } } } as unknown as Response),
    ).toBe(principal);
  });

  it('preserves the missing principal boundary error', () => {
    expect(() => readPrincipal({ locals: {} } as unknown as Response)).toThrow(
      expect.objectContaining({ code: 'missing_auth_principal' }),
    );
  });
});

describe('readBearerToken', () => {
  it('returns the token from a bearer authorization header', () => {
    expect(readBearerToken('Bearer raw-session-token')).toBe(
      'raw-session-token',
    );
  });

  it.each([undefined, '', 'Basic raw-session-token', 'Bearer', 'Bearer   '])(
    'rejects missing or malformed bearer headers: %s',
    (authorization) => {
      expect(() => readBearerToken(authorization)).toThrow(
        expect.objectContaining({
          code: 'missing_bearer_token',
          status: 401,
        }),
      );
    },
  );
});
