import type { PostgresDatabase } from '@pressly/postgres/client';
import { describe, expect, it } from 'vitest';
import { accessCellDeclarations } from './contracts/access-operations-v2.ts';
import {
  passwordStrengthPolicy,
  validatePasswordStrength,
} from './model/language/password-strength.ts';
import { makeAccessSystem } from './system.ts';
import { accessTestSchema } from './testing/schema.ts';

const makeSystem = () =>
  makeAccessSystem({
    db: {} as PostgresDatabase,
    schema: accessTestSchema,
    clock: { now: () => new Date('2026-08-22T16:00:00.000Z') },
    tokenSecret: 'access-system-test-secret',
    sessionTtlMinutes: 30,
    sessionIdleTimeoutMinutes: 30,
    loginWindowMinutes: 15,
    loginMaxFailures: 5,
    mfaChallengeTtlMinutes: 5,
    mfaChallengeMaxAttempts: 8,
    mfaEncryptionKey: Buffer.alloc(32).toString('base64'),
    mfaIssuer: 'Pressly Access Test',
    policies: {
      pricing: { freshSessionMaxAgeMinutes: 15 },
      authSessions: { freshSessionMaxAgeMinutes: 15 },
      mfa: { freshSessionMaxAgeMinutes: 15 },
    },
  });

describe('Access system assembly', () => {
  it('publishes the Access-owned password policy', () => {
    expect(passwordStrengthPolicy).toEqual({ minimumLength: 16 });
    expect(validatePasswordStrength('CorrectHorse1!Battery')).toEqual([]);
  });

  it('maps invalid MFA mechanism configuration at assembly', () => {
    expect(() =>
      makeAccessSystem({
        db: {} as PostgresDatabase,
        schema: accessTestSchema,
        clock: { now: () => new Date('2026-08-22T16:00:00.000Z') },
        tokenSecret: 'access-system-test-secret',
        sessionTtlMinutes: 30,
        sessionIdleTimeoutMinutes: 30,
        loginWindowMinutes: 15,
        loginMaxFailures: 5,
        mfaChallengeTtlMinutes: 5,
        mfaChallengeMaxAttempts: 8,
        mfaEncryptionKey: 'invalid',
        mfaIssuer: 'Pressly Access Test',
        policies: {
          pricing: { freshSessionMaxAgeMinutes: 15 },
          authSessions: { freshSessionMaxAgeMinutes: 15 },
          mfa: { freshSessionMaxAgeMinutes: 15 },
        },
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'invalid_mfa_encryption_key',
        safeMessage: 'MFA encryption is misconfigured.',
      }),
    );
  });

  it('binds every declared operation exactly once through the canonical cells surface', () => {
    const system = makeSystem();
    const cells = Object.values(system.cells);

    expect(cells).toHaveLength(31);
    expect(cells.map(({ id }) => id).sort()).toEqual(
      accessCellDeclarations.map(({ id }) => id).sort(),
    );
    expect(new Set(cells.map(({ id }) => id)).size).toBe(31);
    for (const cell of cells) {
      expect(cell.execute).toEqual(expect.any(Function));
      expect(cell.contract.input.version).toBe(1);
      expect(cell.contract.output.version).toBe(1);
      expect(cell.contract.failure.version).toBe(1);
      expect(cell.surfaces).toHaveLength(
        cell.id === 'access.bootstrap-owner.v2' ? 1 : 0,
      );
      if (cell.id === 'access.bootstrap-owner.v2')
        expect(cell.surfaces[0]?.kind).toBe('cli');
      expect(cell.contract.input.decode({ unexpected: true }).kind).toBe(
        'invalid',
      );
    }
  });

  it('keeps expected validation failures on the cell outcome channel', async () => {
    const system = makeSystem();

    await expect(
      system.cells.bootstrapOwner.execute({
        businessId: '',
        businessSlug: 'pressly-one',
        businessDisplayName: 'Pressly One',
        email: '',
        password: '',
        confirmation: '',
      }),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'missing_bootstrap_owner_email' },
    });

    await expect(
      system.cells.issueWorkforceInvitation.execute({
        actor: { identityId: '', sessionId: '' },
        businessId: '',
        email: '',
        displayName: '',
        intendedRole: 'operator',
        intendedLocationId: null,
        idempotencyKey: '',
      }),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'invalid_workforce_business_id' },
    });

    await expect(
      system.cells.transitionWorkforceMembership.execute({
        actor: { identityId: '', sessionId: '' },
        businessId: '',
        membershipId: '',
        expectedVersion: 0,
        event: 'suspend',
        idempotencyKey: '',
      }),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'invalid_workforce_business_id' },
    });
  });

  it('rejects undeclared boundary fields before a host can invoke the cell', () => {
    const contract = makeSystem().cells.bootstrapOwner.contract.input;
    expect(
      contract.decode({
        businessId: 'business-1',
        email: 'owner@pressly.test',
        password: 'LongPassword123!',
        confirmation: 'bootstrap-first-owner',
        undeclared: true,
      }),
    ).toMatchObject({ kind: 'invalid' });
  });

  it('round-trips Date-rich application values through canonical UTC strings', () => {
    const contract = makeSystem().cells.grantWorkforceAccess.contract.input;
    const startsAt = new Date('2026-08-22T16:30:00.000Z');
    const endsAt = new Date('2026-08-22T20:30:00.000Z');
    const applicationValue = {
      actor: { identityId: 'identity-1', sessionId: 'session-1' },
      businessId: 'business-1',
      membershipId: 'membership-1',
      identityId: 'identity-2',
      role: 'operator' as const,
      scope: { kind: 'location' as const, id: 'location-1' },
      startsAt,
      endsAt,
      idempotencyKey: 'grant-access-1',
    };

    const encoded = contract.encode(applicationValue);
    expect(encoded).toMatchObject({
      startsAt: '2026-08-22T16:30:00.000Z',
      endsAt: '2026-08-22T20:30:00.000Z',
    });
    expect(JSON.stringify(encoded)).toContain(
      '"startsAt":"2026-08-22T16:30:00.000Z"',
    );

    const decoded = contract.decode(encoded);
    expect(decoded).toEqual({ kind: 'valid', value: applicationValue });
    if (decoded.kind === 'valid') {
      expect(decoded.value.startsAt).toBeInstanceOf(Date);
      expect(decoded.value.endsAt).toBeInstanceOf(Date);
    }
  });

  it('rejects native Dates and non-UTC timestamps on the serialized side', () => {
    const contract = makeSystem().cells.grantWorkforceAccess.contract.input;
    const base = {
      actor: { identityId: 'identity-1', sessionId: 'session-1' },
      businessId: 'business-1',
      membershipId: 'membership-1',
      identityId: 'identity-2',
      role: 'operator',
      scope: { kind: 'location', id: 'location-1' },
      idempotencyKey: 'grant-access-1',
    };

    expect(contract.decode({ ...base, startsAt: new Date() }).kind).toBe(
      'invalid',
    );
    expect(
      contract.decode({ ...base, startsAt: '2026-08-22T12:30:00-04:00' }).kind,
    ).toBe('invalid');
    expect(
      makeSystem().cells.login.contract.input.decode({
        email: 'owner@pressly.test',
        password: 'StrongPassword123!',
        requestId: undefined,
      }).kind,
    ).toBe('invalid');
  });
});
