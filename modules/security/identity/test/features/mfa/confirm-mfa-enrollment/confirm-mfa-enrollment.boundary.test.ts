import type { RequestHandler } from 'express';
import { result } from '@pressly/kernel';
import { describe, expect, it, vi } from 'vitest';
import { toMfaRecoveryCodesResult } from '../../../../src/features/mfa/confirm-mfa-enrollment/confirm-mfa-enrollment.contract.mapper.ts';
import { makeConfirmMfaEnrollmentRouter } from '../../../../src/features/mfa/confirm-mfa-enrollment/confirm-mfa-enrollment.route.ts';
import type { ConfirmMfaEnrollment } from '../../../../src/features/mfa/confirm-mfa-enrollment/confirm-mfa-enrollment.usecase.ts';

type RouteLayer = Readonly<{
  route?: Readonly<{ stack: readonly Readonly<{ handle: RequestHandler }>[] }>;
}>;
const pass: RequestHandler = (_request, _response, next) => next();

describe('confirm MFA enrollment boundary', () => {
  it('validates before authentication and authorization', () => {
    const authenticate = vi.fn(pass);
    const authorize = vi.fn(pass);
    const confirmMfaEnrollment = vi
      .fn<ConfirmMfaEnrollment>()
      .mockResolvedValue(result.ok({ recoveryCodes: ['code-one'] }));
    const router = makeConfirmMfaEnrollmentRouter({
      confirmMfaEnrollment,
      authenticate,
      authorize,
    }) as unknown as { stack: RouteLayer[] };
    const stack = router.stack[0]?.route?.stack;

    expect(stack).toHaveLength(4);
    expect(stack?.[1]?.handle).toBe(authenticate);
    expect(stack?.[2]?.handle).toBe(authorize);
  });

  it('maps recovery codes explicitly', () => {
    expect(toMfaRecoveryCodesResult({ recoveryCodes: ['code-one'] })).toEqual({
      recoveryCodes: ['code-one'],
    });
  });
});
