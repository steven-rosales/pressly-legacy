import type { RequestHandler } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { toRegeneratedMfaRecoveryCodesResult } from '../../../../src/features/mfa/regenerate-mfa-recovery-codes/regenerate-mfa-recovery-codes.contract.mapper.ts';
import { makeRegenerateMfaRecoveryCodesRouter } from '../../../../src/features/mfa/regenerate-mfa-recovery-codes/regenerate-mfa-recovery-codes.route.ts';
import type { RegenerateMfaRecoveryCodes } from '../../../../src/features/mfa/regenerate-mfa-recovery-codes/regenerate-mfa-recovery-codes.usecase.ts';

type RouteLayer = Readonly<{
  route?: Readonly<{ stack: readonly Readonly<{ handle: RequestHandler }>[] }>;
}>;
const pass: RequestHandler = (_request, _response, next) => next();

describe('regenerate MFA recovery codes boundary', () => {
  it('authenticates and authorizes before regeneration', () => {
    const authenticate = vi.fn(pass);
    const authorize = vi.fn(pass);
    const regenerateMfaRecoveryCodes = vi
      .fn<RegenerateMfaRecoveryCodes>()
      .mockResolvedValue({ recoveryCodes: ['code-two'] });
    const router = makeRegenerateMfaRecoveryCodesRouter({
      regenerateMfaRecoveryCodes,
      authenticate,
      authorize,
    }) as unknown as { stack: RouteLayer[] };
    const stack = router.stack[0]?.route?.stack;

    expect(stack).toHaveLength(3);
    expect(stack?.[0]?.handle).toBe(authenticate);
    expect(stack?.[1]?.handle).toBe(authorize);
  });

  it('maps regenerated codes explicitly', () => {
    expect(
      toRegeneratedMfaRecoveryCodesResult({ recoveryCodes: ['code-two'] }),
    ).toEqual({ recoveryCodes: ['code-two'] });
  });
});
