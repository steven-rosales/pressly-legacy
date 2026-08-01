import { describe, expect, it } from 'vitest';
import {
  mfaEnrollmentResultSchema,
  mfaRecoveryCodesResultSchema,
  processorCompleteMfaChallengeRequestSchema,
  processorLoginResultSchema,
} from '../src/index.ts';

const principal = {
  identityId: '00000000-0000-4000-8000-000000000001',
  displayName: 'Operator One',
  email: 'operator@example.com',
};
const access = {
  locations: [
    {
      id: 'pressly-one',
      name: 'Pressly One',
      timezone: 'America/New_York',
      capabilities: [
        'processor:view' as const,
        'production:read' as const,
        'production:intake' as const,
      ],
    },
  ],
  applications: [
    {
      id: 'processor' as const,
      label: 'Pressly Processor',
      description: 'Run laundry-floor production.',
      href: 'https://processor.trypressly.com',
    },
    {
      id: 'control' as const,
      label: 'Pressly Control',
      description: 'Manage the business.',
      href: 'https://control.trypressly.com',
    },
  ],
};

describe('processor authentication contracts', () => {
  it('accepts a CSRF proof without admitting a reusable session credential', () => {
    expect(
      processorLoginResultSchema.safeParse({
        status: 'authenticated',
        principal,
        access,
        expiresAt: '2026-08-01T20:00:00.000Z',
        csrfToken: 'a'.repeat(43),
      }).success,
    ).toBe(true);
    expect(
      processorLoginResultSchema.safeParse({
        status: 'authenticated',
        principal,
        access,
        expiresAt: '2026-08-01T20:00:00.000Z',
        csrfToken: 'a'.repeat(43),
        accessToken: 'reusable-secret',
      }).success,
    ).toBe(false);
    expect(
      processorLoginResultSchema.safeParse({
        status: 'authenticated',
        principal: { ...principal, roles: ['operator'] },
        access,
        expiresAt: '2026-08-01T20:00:00.000Z',
        csrfToken: 'a'.repeat(43),
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

  it('rejects app-switch destinations that are not safe origins', () => {
    for (const href of [
      'javascript:alert(1)',
      'https://control.trypressly.com/workforce',
      'https://user:secret@control.trypressly.com',
      'https://control.trypressly.com?token=secret',
    ]) {
      expect(
        processorLoginResultSchema.safeParse({
          status: 'authenticated',
          principal,
          access: {
            ...access,
            applications: [{ ...access.applications[0], href }],
          },
          expiresAt: '2026-08-01T20:00:00.000Z',
          csrfToken: 'a'.repeat(43),
        }).success,
      ).toBe(false);
    }
  });

  it('bounds session projections and rejects duplicate capabilities', () => {
    const session = {
      status: 'authenticated',
      principal,
      access,
      expiresAt: '2026-08-01T20:00:00.000Z',
      csrfToken: 'a'.repeat(43),
    };

    expect(
      processorLoginResultSchema.safeParse({
        ...session,
        access: {
          ...access,
          locations: Array.from({ length: 101 }, (_, index) => ({
            ...access.locations[0],
            id: `pressly-${index}`,
          })),
        },
      }).success,
    ).toBe(false);
    expect(
      processorLoginResultSchema.safeParse({
        ...session,
        access: {
          ...access,
          locations: [
            {
              ...access.locations[0],
              capabilities: ['processor:view', 'processor:view'],
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      processorLoginResultSchema.safeParse({
        ...session,
        access: {
          ...access,
          applications: [
            {
              ...access.applications[0],
              href: `https://${'a'.repeat(290)}.example.com`,
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it('bounds MFA enrollment material and recovery-code collections', () => {
    expect(
      mfaEnrollmentResultSchema.safeParse({
        secret: 's'.repeat(513),
        enrollmentUri: 'otpauth://totp/pressly',
      }).success,
    ).toBe(false);
    expect(
      mfaEnrollmentResultSchema.safeParse({
        secret: 's'.repeat(16),
        enrollmentUri: `otpauth://totp/${'a'.repeat(2_000)}`,
      }).success,
    ).toBe(false);
    expect(
      mfaRecoveryCodesResultSchema.safeParse({
        recoveryCodes: Array.from({ length: 21 }, () => 'recovery-code'),
      }).success,
    ).toBe(false);
    expect(
      mfaRecoveryCodesResultSchema.safeParse({ recoveryCodes: ['short'] })
        .success,
    ).toBe(false);
  });
});
