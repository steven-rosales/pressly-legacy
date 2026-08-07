import type { RequestHandler } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { makeListIdentitySessionsRouter } from '../../../../src/features/sessions/list-identity-sessions/list-identity-sessions.route.ts';
import type { ListIdentitySessions } from '../../../../src/features/sessions/list-identity-sessions/list-identity-sessions.usecase.ts';

type RouteLayer = Readonly<{
  route?: Readonly<{
    path: string;
    stack: readonly Readonly<{ handle: RequestHandler }>[];
  }>;
}>;

const pass: RequestHandler = (_request, _response, next) => next();

describe('list identity sessions HTTP route', () => {
  it('keeps validation ahead of authentication and authorization', () => {
    const authenticate = vi.fn(pass);
    const authorize = vi.fn(pass);
    const listIdentitySessions = vi
      .fn<ListIdentitySessions>()
      .mockResolvedValue({ sessions: [] });
    const router = makeListIdentitySessionsRouter({
      listIdentitySessions,
      authenticate,
      authorize,
    }) as unknown as { stack: RouteLayer[] };

    const route = router.stack[0]?.route;
    expect(route?.path).toBe('/identities/:identityId/sessions');
    expect(route?.stack).toHaveLength(4);
    expect(route?.stack[1]?.handle).toBe(authenticate);
    expect(route?.stack[2]?.handle).toBe(authorize);
  });
});
