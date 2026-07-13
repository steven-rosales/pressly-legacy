import { describe, expect, it } from 'vitest';
import {
  processorCompleteMfaChallengeRequestSchema,
  processorLoginResultSchema,
} from '../src/index.ts';

const principal = {
  identityId: '00000000-0000-4000-8000-000000000001',
  displayName: 'Operator One',
  email: 'operator@example.com',
  roles: ['operator' as const],
};

describe('processor authentication contracts', () => {
  it('accepts a CSRF proof without admitting a reusable session credential', () => {
    expect(
      processorLoginResultSchema.safeParse({
        status: 'authenticated',
        principal,
        expiresAt: '2026-08-01T20:00:00.000Z',
        csrfToken: 'a'.repeat(43),
      }).success,
    ).toBe(true);
    expect(
      processorLoginResultSchema.safeParse({
        status: 'authenticated',
        principal,
        expiresAt: '2026-08-01T20:00:00.000Z',
        csrfToken: 'a'.repeat(43),
        accessToken: 'reusable-secret',
      }).success,
    ).toBe(false);
  });

  it('keeps MFA challenge identity out of browser request and response bodies', () => {
    expect(
      processorLoginResultSchema.safeParse({
        status: 'mfa_required',
        expiresAt: '2026-08-01T20:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      processorCompleteMfaChallengeRequestSchema.safeParse({
        method: 'totp',
        code: '123456',
        challengeToken: 'server-held-secret',
      }).success,
    ).toBe(false);
  });
});
