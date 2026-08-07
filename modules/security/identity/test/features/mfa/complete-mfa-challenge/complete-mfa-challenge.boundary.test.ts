import type { RequestHandler } from 'express';
import { result } from '@pressly/kernel';
import { describe, expect, it, vi } from 'vitest';
import { toCompletedMfaChallengeResult } from '../../../../src/features/mfa/complete-mfa-challenge/complete-mfa-challenge.contract.mapper.ts';
import { makeCompleteMfaChallengeRouter } from '../../../../src/features/mfa/complete-mfa-challenge/complete-mfa-challenge.route.ts';
import type { CompleteMfaChallenge } from '../../../../src/features/mfa/complete-mfa-challenge/complete-mfa-challenge.usecase.ts';

type RouteLayer = Readonly<{
  route?: Readonly<{
    path: string;
    stack: readonly Readonly<{ handle: RequestHandler }>[];
  }>;
}>;

describe('complete MFA challenge boundary', () => {
  it('pairs challenge validation with its controller', () => {
    const complete = vi.fn<CompleteMfaChallenge>().mockResolvedValue(
      result.ok({
        accessToken: 'access-token-with-at-least-thirty-two-characters',
        expiresAt: new Date('2026-06-29T12:30:00.000Z'),
        principal: {
          identityId: '11111111-1111-4111-8111-111111111111',
          displayName: 'Owner',
          roles: ['owner'],
        },
      }),
    );
    const router = makeCompleteMfaChallengeRouter(complete) as unknown as {
      stack: RouteLayer[];
    };

    expect(router.stack[0]?.route?.path).toBe('/challenge');
    expect(router.stack[0]?.route?.stack).toHaveLength(2);
  });

  it('serializes an authenticated session only at the HTTP edge', () => {
    expect(
      toCompletedMfaChallengeResult({
        accessToken: 'access-token-with-at-least-thirty-two-characters',
        expiresAt: new Date('2026-06-29T12:30:00.000Z'),
        principal: {
          identityId: '11111111-1111-4111-8111-111111111111',
          displayName: 'Owner',
          email: 'owner@pressly.test',
          roles: ['owner'],
        },
      }),
    ).toMatchObject({ expiresAt: '2026-06-29T12:30:00.000Z' });
  });
});
