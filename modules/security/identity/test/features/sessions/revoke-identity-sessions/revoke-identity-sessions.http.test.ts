import type { RequestHandler } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { makeRevokeIdentitySessionsRouter } from '../../../../src/features/sessions/revoke-identity-sessions/revoke-identity-sessions.route.ts';
import type { RevokeIdentitySessions } from '../../../../src/features/sessions/revoke-identity-sessions/revoke-identity-sessions.usecase.ts';

type RouteLayer = Readonly<{
  route?: Readonly<{
    path: string;
    stack: readonly Readonly<{ handle: RequestHandler }>[];
  }>;
}>;

const pass: RequestHandler = (_request, _response, next) => next();

describe('revoke identity sessions HTTP routes', () => {
  it('keeps validation ahead of authentication and authorization', () => {
    const authenticate = vi.fn(pass);
    const authorize = vi.fn(pass);
    const revokeIdentitySessions = vi
      .fn<RevokeIdentitySessions>()
      .mockResolvedValue({ revokedCount: 0 });
    const router = makeRevokeIdentitySessionsRouter({
      revokeIdentitySessions,
      authenticate,
      authorize,
      readPrincipalIdentityId: () => '22222222-2222-4222-8222-222222222222',
    }) as unknown as { stack: RouteLayer[] };

    for (const route of router.stack.map((layer) => layer.route)) {
      expect(route?.stack).toHaveLength(4);
      expect(route?.stack[1]?.handle).toBe(authenticate);
      expect(route?.stack[2]?.handle).toBe(authorize);
    }
  });
});
