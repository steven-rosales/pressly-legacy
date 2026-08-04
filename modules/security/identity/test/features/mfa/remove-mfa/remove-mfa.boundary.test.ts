import type { RequestHandler } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { toMfaMutationResult } from '../../../../src/features/mfa/remove-mfa/remove-mfa.contract.mapper.ts';
import { makeRemoveMfaRouter } from '../../../../src/features/mfa/remove-mfa/remove-mfa.route.ts';
import type { RemoveMfa } from '../../../../src/features/mfa/remove-mfa/remove-mfa.usecase.ts';

type RouteLayer = Readonly<{
  route?: Readonly<{ stack: readonly Readonly<{ handle: RequestHandler }>[] }>;
}>;
const pass: RequestHandler = (_request, _response, next) => next();

describe('remove MFA boundary', () => {
  it('authenticates and authorizes before removal', () => {
    const authenticate = vi.fn(pass);
    const authorize = vi.fn(pass);
    const removeMfa = vi.fn<RemoveMfa>().mockResolvedValue({ updated: true });
    const router = makeRemoveMfaRouter({
      removeMfa,
      authenticate,
      authorize,
    }) as unknown as { stack: RouteLayer[] };
    const stack = router.stack[0]?.route?.stack;

    expect(stack).toHaveLength(3);
    expect(stack?.[0]?.handle).toBe(authenticate);
    expect(stack?.[1]?.handle).toBe(authorize);
  });

  it('maps the mutation result explicitly', () => {
    expect(toMfaMutationResult({ updated: true })).toEqual({ updated: true });
  });
});
