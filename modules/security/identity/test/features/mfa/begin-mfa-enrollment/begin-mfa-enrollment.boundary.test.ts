import type { RequestHandler } from 'express';
import { result } from '@pressly/kernel';
import { describe, expect, it, vi } from 'vitest';
import { toMfaEnrollmentResult } from '../../../../src/features/mfa/begin-mfa-enrollment/begin-mfa-enrollment.contract.mapper.ts';
import { makeBeginMfaEnrollmentRouter } from '../../../../src/features/mfa/begin-mfa-enrollment/begin-mfa-enrollment.route.ts';
import type { BeginMfaEnrollment } from '../../../../src/features/mfa/begin-mfa-enrollment/begin-mfa-enrollment.usecase.ts';

type RouteLayer = Readonly<{
  route?: Readonly<{ stack: readonly Readonly<{ handle: RequestHandler }>[] }>;
}>;
const pass: RequestHandler = (_request, _response, next) => next();

describe('begin MFA enrollment boundary', () => {
  it('authenticates and authorizes before enrollment', () => {
    const authenticate = vi.fn(pass);
    const authorize = vi.fn(pass);
    const beginMfaEnrollment = vi.fn<BeginMfaEnrollment>().mockResolvedValue(
      result.ok({
        secret: 'BASE32SECRETVALUE',
        enrollmentUri: 'otpauth://totp/Pressly:Owner',
      }),
    );
    const router = makeBeginMfaEnrollmentRouter({
      beginMfaEnrollment,
      authenticate,
      authorize,
    }) as unknown as { stack: RouteLayer[] };
    const stack = router.stack[0]?.route?.stack;

    expect(stack).toHaveLength(3);
    expect(stack?.[0]?.handle).toBe(authenticate);
    expect(stack?.[1]?.handle).toBe(authorize);
  });

  it('maps enrollment values explicitly', () => {
    expect(
      toMfaEnrollmentResult({
        secret: 'BASE32SECRETVALUE',
        enrollmentUri: 'otpauth://totp/Pressly:Owner',
      }),
    ).toEqual({
      secret: 'BASE32SECRETVALUE',
      enrollmentUri: 'otpauth://totp/Pressly:Owner',
    });
  });
});
